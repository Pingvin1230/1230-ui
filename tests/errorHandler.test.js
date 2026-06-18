// Tests for middleware/errorHandler.js.
//
// Builds a minimal Express app with routes that throw/reject/next(err) and
// mounts the central error handler, then asserts the response envelope
// ({ "error": <string> }) and status codes. Verifies that internal 5xx
// details are never leaked to the client.
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const realFetch = globalThis.fetch.bind(globalThis);

function buildApp() {
  const app = express();
  app.use(express.json());

  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.get('/throws-sync', () => { throw new Error('boom-sync-secret'); });
  app.get('/throws-async', async () => { throw new Error('boom-async-secret'); });
  app.get('/next-err', (_req, _res, next) => {
    next(Object.assign(new Error('forbidden-detail'), { status: 403 }));
  });
  app.get('/validation', (_req, _res, next) => {
    next(Object.assign(new Error('bad input'), { status: 400 }));
  });
  // Unknown status on the error falls back to 500.
  app.get('/weird-status', (_req, _res, next) => {
    next(Object.assign(new Error('weird'), { status: 700 }));
  });
  // Error inside a MOUNTED sub-router — verifies the error handler still sees
  // the real path (Express restores req.url before the app-level error mw).
  const sub = express.Router();
  sub.get('/boom', () => { throw new Error('sub-secret'); });
  app.use('/api/sub', sub);

  app.use(errorHandler);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function req(server, path) {
  const { port } = server.address();
  const res = await realFetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, body: json ?? text };
}

describe('middleware/errorHandler', () => {
  let server;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) { await close(server); server = null; }
  });

  it('returns the { error: string } envelope with HTTP 500 for a sync throw', async () => {
    // The handler logs server-side; silence the expected noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server = await listen(buildApp());
    const r = await req(server, '/throws-sync');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Internal server error' });
    // Internal message must NOT leak to the client.
    expect(JSON.stringify(r.body)).not.toContain('boom-sync-secret');
  });

  it('catches an async rejection (Express 5) with the same 500 envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server = await listen(buildApp());
    const r = await req(server, '/throws-async');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(r.body)).not.toContain('boom-async-secret');
  });

  it('forwards a known 4xx status and its safe message', async () => {
    server = await listen(buildApp());
    const r = await req(server, '/next-err');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'forbidden-detail' });
  });

  it('forwards a 400 validation message', async () => {
    server = await listen(buildApp());
    const r = await req(server, '/validation');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'bad input' });
  });

  it('falls back to 500 for an out-of-range declared status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server = await listen(buildApp());
    const r = await req(server, '/weird-status');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Internal server error' });
  });

  it('does not interfere with normal 200 responses', async () => {
    server = await listen(buildApp());
    const r = await req(server, '/ok');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('catches an error inside a mounted sub-router and logs the real path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    server = await listen(buildApp());
    const r = await req(server, '/api/sub/boom');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Internal server error' });
    const logged = JSON.parse(spy.mock.calls[0][0]);
    // req.url is restored before the app-level error middleware runs, so the
    // full mount path is logged — not the stripped "/boom".
    expect(logged.path).toBe('/api/sub/boom');
  });

  it('logs the error server-side with method/path/status', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    server = await listen(buildApp());
    await req(server, '/throws-sync');
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.method).toBe('GET');
    expect(logged.path).toBe('/throws-sync');
    expect(logged.status).toBe(500);
    // The internal message is available server-side (but not to the client).
    expect(logged.message).toBe('boom-sync-secret');
    expect(typeof logged.stack).toBe('string');
  });
});
