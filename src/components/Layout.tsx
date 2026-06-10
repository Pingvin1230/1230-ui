import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { Navbar } from './Navbar';
import { MobileNav } from './MobileNav';
import { ChatInput } from './ChatInput';
import { ApplicationsPane } from './ApplicationsPane';
import { useThemeStore } from '../store/themeStore';
import { useChatInputStore } from '../store/chatInputStore';
import { useAppsPaneStore } from '../store/appsPaneStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useHermesStatusPoll } from '../hooks/useHermesStatusPoll';

export function Layout() {
  const { isDarkMode } = useThemeStore();
  const navigate = useNavigate();
  const activeSessionId = useChatInputStore((s) => s.activeSessionId);
  const sending = useChatInputStore((s) => s.sending);
  const isBlocked = useChatInputStore((s) => s.isSessionBlocked);
  const setSessionFiles = useChatInputStore((s) => s.setSessionFiles);
  const setHasAttached = useChatInputStore((s) => s.setHasAttachedFiles);
  const appsPaneVisible = useAppsPaneStore((s) => s.visible);
  useHermesStatusPoll();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useKeyboardShortcuts([
    {
      key: 'k',
      metaKey: true,
      action: () => {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Search sessions"]');
        input?.focus();
      },
    },
    {
      key: 'n',
      metaKey: true,
      action: () => navigate('/new'),
    },
  ]);

  const handleSend = useCallback((content: string) => {
    window.dispatchEvent(new CustomEvent('chat:send', { detail: { content } }));
  }, []);

  const handleStop = useCallback(() => {
    window.dispatchEvent(new CustomEvent('chat:stop'));
  }, []);

  const handleSessionFilesChange = useCallback((files: Parameters<typeof setSessionFiles>[0]) => {
    setSessionFiles(files);
  }, [setSessionFiles]);

  const handleAttachedFilesChange = useCallback((has: boolean) => {
    setHasAttached(has);
  }, [setHasAttached]);

  // MobileNav always fixed at bottom (50px)
  // ChatInput always fixed above MobileNav when in chat (50px+)
  const bottomPad = activeSessionId
    ? 'calc(110px + env(safe-area-inset-bottom, 0px))'
    : 'calc(50px + env(safe-area-inset-bottom, 0px))';

  return (
    <div className="h-dvh flex flex-col bg-bg-secondary overflow-hidden">

      <Navbar />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <main
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{ paddingBottom: bottomPad }}
          >
            {activeSessionId && appsPaneVisible ? (
              <div className="flex flex-1 min-h-0">
                <div className="flex flex-col min-w-0 overflow-hidden w-full lg:w-1/2">
                  <Outlet />
                </div>
                <div className="hidden lg:flex lg:flex-col lg:min-w-0 lg:overflow-hidden lg:border-l lg:border-border-default lg:w-1/2">
                  <ApplicationsPane sessionId={activeSessionId} />
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>


        </div>
      </div>

      {/* ChatInput: always fixed above MobileNav */}
      {activeSessionId && (
        <div
          className="fixed inset-x-0 z-[55] border-t border-border-default bg-bg-primary shadow-[0_-2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.4)]"
          style={{ bottom: 'calc(50px + env(safe-area-inset-bottom, 0px))' }}
        >
          <ChatInput
            sessionId={activeSessionId}
            isSessionBlocked={isBlocked}
            sending={sending}
            onSend={handleSend}
            onStop={handleStop}
            onSessionFilesChange={handleSessionFilesChange}
            onAttachedFilesChange={handleAttachedFilesChange}
          />
        </div>
      )}

      <MobileNav />
    </div>
  );
}
