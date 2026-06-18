// 1.14 — vitest coverage: startOpenCodeStream permission handling
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startOpenCodeStream } from '../lib/opencode.js';

// Build a fake SSE body stream that yields the given frames as a
// ReadableStream<Uint8Array>, emulating the daemon's /event response.
const framesToReadableStream = (frames) => {
  const enc = new TextEncoder();
  const chunks = frames.map((f) => enc.encode(f));
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
};

const makeFakeClient = ({ respondPermission } = {}) => ({
  baseUrl: 'http://x:4097',
  _headers: () => ({ Accept: 'application/json', 'Content-Type': 'application/json' }),
  respondPermission: respondPermission ?? vi.fn().mockResolvedValue(undefined),
});

const permissionFrame = (sessionID, permissionId) =>
  `data: ${JSON.stringify({
    type: 'permission.updated',
    properties: { id: permissionId, sessionID, messageID: 'msg_1', type: 'bash', title: 'bash' },
  })}\n\n`;

const idleFrame = (sessionID) =>
  `data: ${JSON.stringify({
    type: 'session.idle',
    properties: { sessionID },
  })}\n\n`;

const drain = async (stream) => {
  const out = [];
  for await (const evt of stream.events) {
    out.push(evt);
    if (evt.type === 'done' || evt.type === 'error') break;
  }
  return out;
};

describe('startOpenCodeStream — permission.updated handling', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const wireFetch = (frames) => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: framesToReadableStream(frames),
    }));
  };

  it('auto-approves (once) when autoApprovePermissions is true', async () => {
    wireFetch([permissionFrame('ses_1', 'perm_42'), idleFrame('ses_1')]);
    const client = makeFakeClient();
    const stream = startOpenCodeStream(client, 'ses_1', { autoApprovePermissions: true });

    const events = await drain(stream);

    expect(client.respondPermission).toHaveBeenCalledTimes(1);
    expect(client.respondPermission).toHaveBeenCalledWith('ses_1', 'perm_42', 'once');
    // permission.updated must not surface as a stream event.
    expect(events.find((e) => e.type === 'permission.updated')).toBeUndefined();
    // The terminal 'done' event still flows through.
    expect(events.some((e) => e.type === 'done')).toBe(true);
    stream.close();
  });

  it('does NOT approve when autoApprovePermissions is false', async () => {
    wireFetch([permissionFrame('ses_1', 'perm_99'), idleFrame('ses_1')]);
    const client = makeFakeClient();
    const stream = startOpenCodeStream(client, 'ses_1', { autoApprovePermissions: false });

    await drain(stream);

    expect(client.respondPermission).not.toHaveBeenCalled();
    stream.close();
  });

  it('does NOT approve when the flag is absent (default off at the stream level)', async () => {
    wireFetch([permissionFrame('ses_1', 'perm_7'), idleFrame('ses_1')]);
    const client = makeFakeClient();
    const stream = startOpenCodeStream(client, 'ses_1');

    await drain(stream);

    expect(client.respondPermission).not.toHaveBeenCalled();
    stream.close();
  });

  it('ignores permission events scoped to a different session', async () => {
    wireFetch([permissionFrame('ses_OTHER', 'perm_x'), idleFrame('ses_1')]);
    const client = makeFakeClient();
    const stream = startOpenCodeStream(client, 'ses_1', { autoApprovePermissions: true });

    await drain(stream);

    expect(client.respondPermission).not.toHaveBeenCalled();
    stream.close();
  });

  it('does not crash when a permission event lacks an id', async () => {
    const badFrame =
      `data: ${JSON.stringify({
        type: 'permission.updated',
        properties: { sessionID: 'ses_1', type: 'bash' },
      })}\n\n`;
    wireFetch([badFrame, idleFrame('ses_1')]);
    const client = makeFakeClient();
    const stream = startOpenCodeStream(client, 'ses_1', { autoApprovePermissions: true });

    const events = await drain(stream);

    expect(client.respondPermission).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'done')).toBe(true);
    stream.close();
  });
});
