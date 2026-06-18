import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Copy, Check, ChevronDown } from 'lucide-react';
import type { Message, Session, AgentFile } from '../types/api';
import { useChatInputStore, type LiveToolCall } from '../store/chatInputStore';
import MarkdownRenderer from './MarkdownRenderer';
import { AgentFileGroup } from './AgentFileCard';
import { NoMessagesIllustration } from '../assets/illustrations';
import {
  buildRenderItems,
  renderItemsKey,
  type RenderItem,
} from './messageListUtils';

interface MessageListProps {
  sessionId: string;
  messages: Message[];
  session: Session | null;
  copiedMessageId: number | null;
  onCopyMessage: (msgId: number, content: string) => void;
  overlay: {
    showEmpty: boolean;
    showPendingUserBubble: boolean;
    pendingUserContent: string | null;
    liveActiveToolCalls: LiveToolCall[];
    liveCompletedToolCalls: LiveToolCall[];
    showStreamingBubble: boolean;
    streamingContent: string;
    sending: boolean;
    liveAgentFiles: AgentFile[];
    isWaiting: boolean;
  };
  isAtBottom: boolean;
  isAtBottomRef: RefObject<boolean>;
  unreadCount: number;
  onAtBottomChange: (atBottom: boolean) => void;
}

export function MessageList({
  sessionId,
  messages,
  session,
  copiedMessageId,
  onCopyMessage,
  overlay,
  isAtBottom,
  isAtBottomRef,
  unreadCount,
  onAtBottomChange,
}: MessageListProps) {
  const { t } = useTranslation();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const items = buildRenderItems(messages, overlay);

  // Auto-scroll while the in-flight overlay grows — but only if the user is
  // parked at the bottom. Mirrors the old scrollIntoView-on-stream effect:
  // never yanks the view if the user scrolled up to read history.
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' });
  }, [
    items.length,
    overlay.streamingContent,
    overlay.pendingUserContent,
    overlay.liveActiveToolCalls,
    overlay.liveCompletedToolCalls,
    overlay.showPendingUserBubble,
    overlay.showStreamingBubble,
    overlay.isWaiting,
    isAtBottomRef,
  ]);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
  };

  const renderItem = (item: RenderItem) => {
    switch (item.kind) {
      case 'empty':
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <NoMessagesIllustration className="w-20 h-20 mb-4 text-fg-muted" />
            <h2 className="text-lg font-semibold text-fg-primary mb-1">
              {t('chat.startConversation')}
            </h2>
            <p className="text-sm text-fg-muted max-w-sm mb-8">
              {t('chat.startConversationDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {[
                t('chat.suggestion1', { defaultValue: 'Объясни простыми словами' }),
                t('chat.suggestion2', { defaultValue: 'Помоги составить план' }),
                t('chat.suggestion3', { defaultValue: 'Исправь ошибки в тексте' }),
                t('chat.suggestion4', { defaultValue: 'Переведи на русский' }),
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => useChatInputStore.getState().prefillInput(suggestion)}
                  className="text-left px-4 py-3 rounded-xl border border-border-default bg-bg-primary hover:bg-bg-secondary hover:border-blue-300 dark:hover:border-blue-700 transition-all text-sm text-fg-secondary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        );

      case 'user': {
        const m = item.message;
        return (
          <div className="flex justify-end group">
            <div className="max-w-[75%] min-w-0">
              <div className="px-3 py-2 rounded-2xl rounded-tr-sm bg-white dark:bg-gray-800 text-fg-primary text-sm shadow-sm">
                <MarkdownRenderer content={m.content || ''} className="user-message" />
              </div>
              <div className="flex justify-end mt-1 px-1">
                <button type="button" onClick={() => onCopyMessage(m.id, m.content || '')}
                  aria-label={copiedMessageId === m.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-bg-secondary text-fg-muted hover:text-fg-primary">
                  {copiedMessageId === m.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        );
      }

      case 'toolGroup': {
        const tools = item.tools;
        return (
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-xs text-fg-muted hover:text-fg-secondary transition-colors w-fit">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('chat.completedTools', { count: tools.length })}
            </summary>
            <div className="mt-1 ml-4 space-y-0.5">
              {tools.map((tc) => (
                <div key={tc.id} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <span className="font-mono">{tc.toolName}</span>
                </div>
              ))}
            </div>
          </details>
        );
      }

      case 'assistant': {
        const m = item.message;
        const executorId = session?.assistant?.executor ?? 'hermes';
        const executorBadge = t(`assistants.executorBadge.${executorId}`, {
          defaultValue: executorId === 'opencode-1230' ? '⚡ OpenCode' : '🤖 Hermes',
        });
        return (
          <div className="group">
            <div className="text-sm text-fg-primary">
              <MarkdownRenderer content={m.content || ''} className="assistant-message" />
            </div>
            {m.agentFiles && m.agentFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                <AgentFileGroup files={m.agentFiles} sessionId={sessionId} />
              </div>
            )}
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {m.latencyMs != null && (
                <span className="text-xs text-fg-muted mr-1">{(m.latencyMs / 1000).toFixed(1)}s</span>
              )}
              <button type="button" onClick={() => onCopyMessage(m.id, m.content || '')}
                aria-label={copiedMessageId === m.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                className="p-1 rounded-md bg-bg-secondary text-fg-muted hover:text-fg-primary transition-colors">
                {copiedMessageId === m.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              </button>
              <span className="text-xs text-fg-muted ml-1 select-none">
                {t('chat.viaExecutor', { name: executorBadge })}
              </span>
            </div>
          </div>
        );
      }

      case 'pendingUser': {
        return (
          <div className="flex justify-end group">
            <div className="max-w-[75%] min-w-0">
              <div className="px-3 py-2 rounded-2xl rounded-tr-sm bg-white dark:bg-gray-800 text-fg-primary text-sm shadow-sm">
                <MarkdownRenderer content={item.content} className="user-message" />
              </div>
            </div>
          </div>
        );
      }

      case 'activeTools': {
        return (
          <div className="space-y-1">
            {item.calls.map((tc) => (
              <div key={tc.id} className="flex items-center gap-2 text-xs text-fg-muted">
                <div className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-pulse flex-shrink-0" />
                <span className="font-mono">{tc.toolName}</span>
                {tc.label && <span>{tc.label}</span>}
              </div>
            ))}
          </div>
        );
      }

      case 'completedTools': {
        return (
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-xs text-fg-muted hover:text-fg-secondary transition-colors w-fit">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('chat.completedTools', { count: item.calls.length })}
            </summary>
            <div className="mt-1 ml-4 space-y-0.5">
              {item.calls.map((tc) => (
                <div key={tc.id} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <span className="font-mono">{tc.toolName}</span>
                  {tc.label && <span>{tc.label}</span>}
                </div>
              ))}
            </div>
          </details>
        );
      }

      case 'streaming': {
        const { content, sending, agentFiles } = item;
        return (
          <div className="text-sm text-fg-primary">
            <MarkdownRenderer content={content} className="assistant-message" />
            {sending && (
              <span className="inline-block w-0.5 h-4 bg-fg-primary align-middle ml-0.5 animate-[blink_1s_step-end_infinite]" aria-hidden="true" />
            )}
            {agentFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                <AgentFileGroup files={agentFiles} sessionId={sessionId} />
              </div>
            )}
          </div>
        );
      }

      case 'waiting': {
        return (
          <div className="flex items-center gap-1.5 py-1">
            <div className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        );
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 relative">
      <Virtuoso
        ref={virtuosoRef}
        className="h-full"
        data={items}
        computeItemKey={(_index, item) => renderItemsKey(item)}
        itemContent={(_index, item) => (
          <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-3">
            {renderItem(item)}
          </div>
        )}
        components={{ Header: () => <div className="h-4" /> }}
        followOutput={(atBottom) => (atBottom ? 'auto' : false)}
        atBottomStateChange={onAtBottomChange}
        atBottomThreshold={100}
        increaseViewportBy={{ top: 400, bottom: 400 }}
        initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
      />

      {!isAtBottom && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={unreadCount > 0 ? t('chat.scrollToNewMessages', { count: unreadCount }) : t('chat.scrollToBottom', { defaultValue: 'Scroll to bottom' })}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-primary border border-border-default hover:bg-bg-secondary text-fg-primary text-xs font-medium shadow-lg transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            {unreadCount > 0 ? t('chat.newMessagesBadge', { count: unreadCount }) : t('chat.scrollToBottom', { defaultValue: '↓' })}
          </button>
        </div>
      )}
    </div>
  );
}
