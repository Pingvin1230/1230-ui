import { describe, it, expect } from 'vitest';
import type { Message } from '../types/api';
import {
  buildMessageBlocks,
  buildRenderItems,
  renderItemsKey,
  stripAttachedFilePrefix,
  committedUserMatchesPending,
} from './messageListUtils';

function msg(partial: Partial<Message> & { id: number; role: Message['role'] }): Message {
  return {
    sessionId: 's1',
    content: null,
    timestamp: 0,
    ...partial,
  };
}

const baseOverlay = {
  showEmpty: false,
  showPendingUserBubble: false,
  pendingUserContent: null,
  liveActiveToolCalls: [],
  liveCompletedToolCalls: [],
  showStreamingBubble: false,
  streamingContent: '',
  sending: false,
  liveAgentFiles: [],
  isWaiting: false,
};

describe('buildMessageBlocks', () => {
  it('returns a single empty block for no messages', () => {
    expect(buildMessageBlocks([])).toEqual([{ user: null, tools: [], assistant: null }]);
  });

  it('groups a user → tools → assistant turn into one block', () => {
    const messages = [
      msg({ id: 1, role: 'user', content: 'hi' }),
      msg({ id: 2, role: 'tool', toolName: 'search' }),
      msg({ id: 3, role: 'tool', toolName: 'read' }),
      msg({ id: 4, role: 'assistant', content: 'answer' }),
    ];
    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].user?.id).toBe(1);
    expect(blocks[0].tools.map((m) => m.id)).toEqual([2, 3]);
    expect(blocks[0].assistant?.id).toBe(4);
  });

  it('starts a new block on the next user message', () => {
    const messages = [
      msg({ id: 1, role: 'user', content: 'q1' }),
      msg({ id: 2, role: 'assistant', content: 'a1' }),
      msg({ id: 3, role: 'user', content: 'q2' }),
      msg({ id: 4, role: 'assistant', content: 'a2' }),
    ];
    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].user?.id).toBe(1);
    expect(blocks[1].user?.id).toBe(3);
  });

  it('discards an empty intermediate assistant then reuses the slot', () => {
    const messages = [
      msg({ id: 1, role: 'user', content: 'q' }),
      msg({ id: 2, role: 'assistant', content: '' }),
      msg({ id: 3, role: 'assistant', content: 'real answer' }),
    ];
    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].assistant?.id).toBe(3);
  });

  it('splits when a second non-empty assistant follows in the same turn', () => {
    const messages = [
      msg({ id: 1, role: 'user', content: 'q' }),
      msg({ id: 2, role: 'assistant', content: 'first' }),
      msg({ id: 3, role: 'assistant', content: 'second' }),
    ];
    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].assistant?.content).toBe('first');
    expect(blocks[1].assistant?.content).toBe('second');
  });
});

describe('buildRenderItems', () => {
  it('renders the empty-state item only when there are no committed messages', () => {
    expect(buildRenderItems([], { ...baseOverlay, showEmpty: true })).toEqual([{ kind: 'empty' }]);
    expect(buildRenderItems([msg({ id: 1, role: 'user', content: 'x' })], { ...baseOverlay })).not.toContainEqual({ kind: 'empty' });
  });

  it('places the overlay after committed blocks in the exact documented order', () => {
    const items = buildRenderItems(
      [
        msg({ id: 1, role: 'user', content: 'q' }),
        msg({ id: 2, role: 'tool', toolName: 't' }),
        msg({ id: 3, role: 'assistant', content: 'a' }),
      ],
      {
        ...baseOverlay,
        showPendingUserBubble: true,
        pendingUserContent: 'next',
        liveActiveToolCalls: [{ id: 'tc1', toolName: 'live' }],
        liveCompletedToolCalls: [{ id: 'tc2', toolName: 'done' }],
        showStreamingBubble: true,
        streamingContent: 'streaming',
        sending: true,
        isWaiting: false,
      },
    );
    expect(items.map((i) => i.kind)).toEqual([
      'user',
      'toolGroup',
      'assistant',
      'pendingUser',
      'activeTools',
      'completedTools',
      'streaming',
    ]);
  });

  it('appends the waiting indicator last', () => {
    const items = buildRenderItems([], { ...baseOverlay, isWaiting: true });
    expect(items.at(-1)).toEqual({ kind: 'waiting' });
  });

  it('omits a toolGroup block that has no tool messages', () => {
    const items = buildRenderItems([msg({ id: 1, role: 'user', content: 'q' })], baseOverlay);
    expect(items.map((i) => i.kind)).toEqual(['user']);
  });
});

describe('renderItemsKey', () => {
  it('produces stable, distinct keys per item identity', () => {
    const items = buildRenderItems(
      [
        msg({ id: 7, role: 'user', content: 'q' }),
        msg({ id: 8, role: 'tool', toolName: 't' }),
        msg({ id: 9, role: 'assistant', content: 'a' }),
      ],
      {
        ...baseOverlay,
        showPendingUserBubble: true,
        pendingUserContent: 'p',
        liveActiveToolCalls: [{ id: 'x', toolName: 'y' }],
        liveCompletedToolCalls: [{ id: 'z', toolName: 'w' }],
        showStreamingBubble: true,
        streamingContent: 's',
        sending: true,
        isWaiting: true,
      },
    );
    const keys = new Set(items.map(renderItemsKey));
    expect(keys.size).toBe(items.length);
  });
});

describe('C8 optimistic-bubble dedup', () => {
  describe('stripAttachedFilePrefix', () => {
    it('leaves content untouched when no prefix is present', () => {
      expect(stripAttachedFilePrefix('hello world')).toBe('hello world');
    });

    it('strips a single attached-file line + blank separator', () => {
      expect(stripAttachedFilePrefix('[Attached file: /tmp/a.txt]\n\nhello')).toBe('hello');
    });

    it('strips multiple attached-file lines + blank separator', () => {
      expect(stripAttachedFilePrefix('[Attached file: /tmp/a.txt]\n[Attached file: /tmp/b.txt]\n\nhello')).toBe('hello');
    });

    it('does not strip a user-typed fake prefix that has no blank separator', () => {
      expect(stripAttachedFilePrefix('[Attached file: x]\nhello')).toBe('[Attached file: x]\nhello');
    });
  });

  describe('committedUserMatchesPending', () => {
    it('matches exactly when no files were attached', () => {
      expect(committedUserMatchesPending('Hello', 'Hello')).toBe(true);
      expect(committedUserMatchesPending('  Hello  ', 'Hello')).toBe(true);
    });

    it('matches after stripping the attached-file prefix', () => {
      expect(committedUserMatchesPending('[Attached file: /p/f.txt]\n\nHello', 'Hello')).toBe(true);
    });

    it('returns false for a different message (no false positive)', () => {
      expect(committedUserMatchesPending('hello world', 'world')).toBe(false);
      expect(committedUserMatchesPending('goodbye', 'hello')).toBe(false);
    });

    it('returns false for null / empty committed content', () => {
      expect(committedUserMatchesPending(null, 'x')).toBe(false);
      expect(committedUserMatchesPending('', 'x')).toBe(false);
      expect(committedUserMatchesPending(undefined, 'x')).toBe(false);
    });
  });
});
