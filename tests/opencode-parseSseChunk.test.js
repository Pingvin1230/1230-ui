// 1.14 — vitest coverage: SSE chunk parser
import { describe, it, expect } from 'vitest';
import { parseSseChunk } from '../lib/opencode.js';

const collect = (chunk) => Array.from(parseSseChunk(chunk));

describe('parseSseChunk', () => {
  describe('simple data frame', () => {
    it('parses a single data line', () => {
      const frames = collect('data: hello\n\n');
      expect(frames).toEqual([{ data: 'hello' }]);
    });

    it('handles data with surrounding whitespace before the blank line', () => {
      const frames = collect('data: hello\n   \n\n');
      expect(frames).toEqual([{ data: 'hello' }]);
    });
  });

  describe('event + data fields', () => {
    it('parses both event and data on separate lines', () => {
      const frames = collect('event: foo\ndata: bar\n\n');
      expect(frames).toEqual([{ event: 'foo', data: 'bar' }]);
    });

    it('parses event and data even when not adjacent to the blank line', () => {
      const frames = collect('event: ping\ndata: pong\n\n');
      expect(frames[0].event).toBe('ping');
      expect(frames[0].data).toBe('pong');
    });
  });

  describe('multiline data', () => {
    it('joins multiple data lines with \\n', () => {
      const frames = collect('data: line1\ndata: line2\n\n');
      expect(frames).toEqual([{ data: 'line1\nline2' }]);
    });

    it('joins three or more data lines preserving order', () => {
      const frames = collect('data: a\ndata: b\ndata: c\n\n');
      expect(frames[0].data).toBe('a\nb\nc');
    });
  });

  describe('CRLF normalization', () => {
    it('treats \\r\\n as a normal newline', () => {
      const frames = collect('data: x\r\n\r\n');
      expect(frames).toEqual([{ data: 'x' }]);
    });

    it('handles mixed \\r\\n and \\n line endings in a single frame', () => {
      const frames = collect('data: a\r\ndata: b\n\n');
      expect(frames[0].data).toBe('a\nb');
    });
  });

  describe('keepalive comments', () => {
    it('yields null for :keepalive comment lines', () => {
      const frames = collect(': keepalive\n\n');
      expect(frames).toEqual([null]);
    });

    it('yields null for a comment-only line with no space', () => {
      const frames = collect(':ping\n\n');
      expect(frames).toEqual([null]);
    });
  });

  describe('space stripping after colon', () => {
    it('strips a single leading space from the value', () => {
      const frames = collect('data: hello world\n\n');
      expect(frames[0].data).toBe('hello world');
    });

    it('does not strip additional spaces inside the value', () => {
      const frames = collect('data:   multi   space\n\n');
      expect(frames[0].data).toBe('  multi   space');
    });

    it('keeps a value that has no space after the colon verbatim', () => {
      const frames = collect('data:no-space\n\n');
      expect(frames[0].data).toBe('no-space');
    });
  });

  describe('empty chunk', () => {
    it('yields nothing for a chunk that is only a blank line', () => {
      const frames = collect('\n\n');
      expect(frames).toEqual([]);
    });

    it('yields nothing for an empty string', () => {
      const frames = collect('');
      expect(frames).toEqual([]);
    });
  });

  describe('trailing frame without terminator', () => {
    it('still yields the final frame if the chunk does not end with \\n\\n', () => {
      const frames = collect('data: tail');
      expect(frames).toEqual([{ data: 'tail' }]);
    });

    it('yields multiple frames if the last is unterminated', () => {
      const frames = collect('data: first\n\ndata: second');
      expect(frames).toEqual([{ data: 'first' }, { data: 'second' }]);
    });
  });

  describe('id field', () => {
    it('parses an id field alongside data', () => {
      const frames = collect('id: 42\ndata: hi\n\n');
      expect(frames[0]).toEqual({ id: '42', data: 'hi' });
    });
  });

  describe('lines without a colon are ignored', () => {
    it('skips garbage lines and still yields valid frames', () => {
      const frames = collect('garbage line\ndata: ok\n\n');
      expect(frames).toEqual([{ data: 'ok' }]);
    });
  });
});
