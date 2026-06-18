import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage, ChatError, SessionFile } from '../lib/api';

// Mock the api layer: sendMessage just captures its arguments and hands back
// a real AbortController so tests can drive the SSE callbacks manually.
vi.mock('../lib/api', () => ({
  api: { sendMessage: vi.fn(() => new AbortController()) },
}));

import { api } from '../lib/api';
import { useChatInputStore } from './chatInputStore';

type SendOpts = {
  onChunk?: (c: string) => void;
  onDone?: (c: string) => void;
  onError?: (e: ChatError) => void;
  onToolCallStart?: (id: string, name: string, label?: string) => void;
  onToolCallEnd?: (id: string) => void;
};

let lastMessages: ChatMessage[] = [];
let lastOpts: SendOpts = {};

const SID = 'test-session-1';

describe('chatInputStore stream ownership (B11)', () => {
  beforeEach(() => {
    useChatInputStore.setState({
      liveMessages: {},
      isSessionBlocked: false,
      activeSessionId: null,
      sending: false,
    });
    lastMessages = [];
    lastOpts = {};
    vi.mocked(api.sendMessage).mockImplementation((messages, opts) => {
      lastMessages = messages;
      lastOpts = opts as SendOpts;
      return new AbortController();
    });
  });

  it('startStream sets status streaming + pendingUserContent', () => {
    useChatInputStore.getState().startStream(SID, {
      model: 'gpt-test',
      history: [{ role: 'user', content: 'hi' }],
      content: 'Hello world',
    });
    const live = useChatInputStore.getState().liveMessages[SID];
    expect(live).toBeDefined();
    expect(live!.status).toBe('streaming');
    expect(live!.pendingUserContent).toBe('Hello world');
    expect(live!.streamingContent).toBe('');
    expect(live!.agentFiles).toEqual([]);
    expect(live!.startedAt).not.toBeNull();
  });

  it('sends history + the new (file-prefixed) user message to the LLM', () => {
    useChatInputStore.getState().startStream(SID, {
      model: 'm',
      history: [{ role: 'user', content: 'prior' }],
      content: 'see attached',
      attachedFilePaths: ['/tmp/a.txt'],
    });
    expect(lastMessages).toEqual([
      { role: 'user', content: 'prior' },
      { role: 'user', content: '[Attached file: /tmp/a.txt]\n\nsee attached' },
    ]);
    // The optimistic user bubble keeps the typed text only.
    expect(useChatInputStore.getState().liveMessages[SID]!.pendingUserContent).toBe('see attached');
  });

  it('onChunk accumulates into streamingContent', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    lastOpts.onChunk?.('Hello');
    lastOpts.onChunk?.(' there');
    expect(useChatInputStore.getState().liveMessages[SID]!.streamingContent).toBe('Hello there');
  });

  it('tool-call callbacks move from active to completed', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    lastOpts.onToolCallStart?.('t1', 'search', 'looking');
    expect(useChatInputStore.getState().liveMessages[SID]!.activeToolCalls).toHaveLength(1);
    lastOpts.onToolCallEnd?.('t1');
    const live = useChatInputStore.getState().liveMessages[SID]!;
    expect(live.activeToolCalls).toHaveLength(0);
    expect(live.completedToolCalls).toHaveLength(1);
    expect(live.completedToolCalls[0]).toEqual({ id: 't1', toolName: 'search', label: 'looking' });
  });

  it('onDone transitions to idle keeping the final content', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    lastOpts.onDone?.('final answer');
    const live = useChatInputStore.getState().liveMessages[SID]!;
    expect(live.status).toBe('idle');
    expect(live.streamingContent).toBe('final answer');
  });

  it('onError records the error and clears the in-flight overlay', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    lastOpts.onChunk?.('partial');
    lastOpts.onError?.({ type: 'network', message: 'boom', retryable: true });
    const live = useChatInputStore.getState().liveMessages[SID]!;
    expect(live.status).toBe('error');
    expect(live.error?.message).toBe('boom');
    expect(live.streamingContent).toBe('');
    expect(live.pendingUserContent).toBeNull();
  });

  it('content_moderation errors mark the session blocked', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    lastOpts.onError?.({ type: 'content_moderation', message: 'blocked', retryable: false });
    expect(useChatInputStore.getState().isSessionBlocked).toBe(true);
  });

  it('stopStream clears the live slice', () => {
    useChatInputStore.getState().startStream(SID, { model: 'm', history: [], content: 'q' });
    expect(useChatInputStore.getState().liveMessages[SID]).toBeDefined();
    useChatInputStore.getState().stopStream(SID);
    expect(useChatInputStore.getState().liveMessages[SID]).toBeUndefined();
  });

  it('two concurrent sessions get independent live slices', () => {
    useChatInputStore.getState().startStream('s1', { model: 'm', history: [], content: 'one' });
    const opts1 = lastOpts;
    useChatInputStore.getState().startStream('s2', { model: 'm', history: [], content: 'two' });
    opts1.onChunk?.('a');
    lastOpts.onChunk?.('b');
    const lm = useChatInputStore.getState().liveMessages;
    expect(lm['s1']!.streamingContent).toBe('a');
    expect(lm['s2']!.streamingContent).toBe('b');
    expect(lm['s1']!.pendingUserContent).toBe('one');
    expect(lm['s2']!.pendingUserContent).toBe('two');
  });
});

describe('chatInputStore UI-trigger actions (D3)', () => {
  beforeEach(() => {
    useChatInputStore.setState({ pendingInputActions: [], pendingChatActions: [] });
  });

  it('prefillInput / addFileToInput / insertTextToInput enqueue input actions', () => {
    const file: SessionFile = {
      id: 1, sessionId: SID, filename: 'a.txt', storedName: 'a', mimeType: null,
      size: 10, uploadedAt: 0, path: '/tmp/a.txt',
    };
    useChatInputStore.getState().prefillInput('hello');
    useChatInputStore.getState().addFileToInput(file);
    useChatInputStore.getState().insertTextToInput('more');
    const q = useChatInputStore.getState().pendingInputActions;
    expect(q).toHaveLength(3);
    expect(q.map((a) => a.type)).toEqual(['prefill', 'addFile', 'insertText']);
    expect(q[0]).toMatchObject({ type: 'prefill', text: 'hello' });
    expect(q[1]).toMatchObject({ type: 'addFile', file });
    expect(q[2]).toMatchObject({ type: 'insertText', text: 'more' });
  });

  it('every enqueued action gets a strictly increasing nonce', () => {
    useChatInputStore.getState().prefillInput('a');
    useChatInputStore.getState().prefillInput('b');
    const [first, second] = useChatInputStore.getState().pendingInputActions;
    expect(second.nonce).toBeGreaterThan(first.nonce);
  });

  it('requestSend / requestStop enqueue chat actions with payloads', () => {
    useChatInputStore.getState().requestSend('send me');
    useChatInputStore.getState().requestStop();
    const q = useChatInputStore.getState().pendingChatActions;
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ type: 'send', content: 'send me' });
    expect(q[1]).toMatchObject({ type: 'stop' });
    expect(q[1].nonce).toBeGreaterThan(q[0].nonce);
  });

  it('batched same-tick actions all accumulate (preserves Cloud Connect file loops)', () => {
    const mk = (i: number): SessionFile => ({
      id: i, sessionId: SID, filename: `f${i}.txt`, storedName: '', mimeType: null,
      size: 1, uploadedAt: 0, path: `/tmp/f${i}.txt`,
    });
    // Mirror InsertBar.tsx: result.files.forEach(f => addFileToInput(f))
    [1, 2, 3].map(mk).forEach((f) => useChatInputStore.getState().addFileToInput(f));
    const q = useChatInputStore.getState().pendingInputActions;
    expect(q).toHaveLength(3);
    expect(q.map((a) => (a.type === 'addFile' ? a.file.filename : null))).toEqual(['f1.txt', 'f2.txt', 'f3.txt']);
  });

  it('a consumer can drain by nonce and trim without losing a concurrent push', () => {
    useChatInputStore.getState().prefillInput('one');
    const snapshot = useChatInputStore.getState().pendingInputActions;
    // Simulate a request arriving after the consumer read its snapshot
    useChatInputStore.getState().prefillInput('two');
    // Consumer processes its (stale) snapshot, then trims the live store
    // keeping anything newer than the max nonce it handled.
    const maxNonce = snapshot[snapshot.length - 1].nonce;
    useChatInputStore.setState((s) => ({
      pendingInputActions: s.pendingInputActions.filter((a) => a.nonce > maxNonce),
    }));
    const remaining = useChatInputStore.getState().pendingInputActions;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ type: 'prefill', text: 'two' });
  });
});
