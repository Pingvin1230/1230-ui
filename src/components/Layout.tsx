import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { ChatInput } from './ChatInput';
import { useThemeStore } from '../store/themeStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useChatInputStore } from '../store/chatInputStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useHermesStatusPoll } from '../hooks/useHermesStatusPoll';
import { useMobile } from '../hooks/useMobile';

export function Layout() {
  const { isDarkMode } = useThemeStore();
  const isSidebarOpen = useSidebarStore((s) => s.isOpen);
  const setIsSidebarOpen = useSidebarStore((s) => s.setOpen);
  const navigate = useNavigate();
  const activeSessionId = useChatInputStore((s) => s.activeSessionId);
  const sending = useChatInputStore((s) => s.sending);
  const isBlocked = useChatInputStore((s) => s.isSessionBlocked);
  const setSessionFiles = useChatInputStore((s) => s.setSessionFiles);
  const setHasAttached = useChatInputStore((s) => s.setHasAttachedFiles);
  const isMobile = useMobile();
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

  // MobileNav height ≈ 52px + safe-area-inset-bottom
  // ChatInput height ≈ 68px
  // Total padding needed at bottom when both visible ≈ 130px
  const bottomPad = isMobile
    ? activeSessionId
      ? 'calc(130px + env(safe-area-inset-bottom, 0px))'
      : 'calc(56px + env(safe-area-inset-bottom, 0px))'
    : '0px';

  return (
    // Root: full viewport height, no overflow — everything scrolls inside
    <div className="h-dvh flex flex-col bg-bg-secondary overflow-hidden">

      {/* Top navbar — always visible, never scrolls */}
      <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />

      {/* Body row: sidebar + main content */}
      <div className="flex flex-1 min-h-0">

        {/*
          DESKTOP sidebar: part of the flex flow, pushes content to the right.
          Hidden on mobile (isMobile guard in Sidebar itself).
        */}
        <Sidebar isSidebarOpen={isSidebarOpen} isMobile={isMobile} />

        {/*
          Main column: fills remaining width, scrolls vertically.
          On mobile the fixed MobileNav/ChatInput overlap the bottom —
          we compensate with paddingBottom so the last content item is visible.
        */}
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          {/*
            main is a flex column that fills remaining height.
            - Pages with self-managed scroll (ChatPage) use overflow-y-auto on their own root.
            - Simple pages (Dashboard, Sessions, Settings…) get a scrollable wrapper here.
          */}
          {/*
            main: fixed height, clips overflow.
            Every page component is responsible for its own scroll:
            - Set className="flex-1 min-h-0 overflow-y-auto" on the root div.
            - ChatPage already does this with scrollContainerRef.
            - SessionsPage, Dashboard etc. get a plain overflow-y-auto wrapper below.
          */}
          <main
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{ paddingBottom: bottomPad }}
          >
            <Outlet />
          </main>

          {/* Desktop only: ChatInput in normal flow at the bottom */}
          {activeSessionId && !isMobile && (
            <div className="flex-shrink-0 border-t border-border-default bg-bg-primary shadow-[0_-2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.4)]">
              <div className="p-3 sm:p-4">
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
            </div>
          )}
        </div>
      </div>

      {/* Mobile sidebar overlay backdrop */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/50"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/*
        Mobile ChatInput: fixed above MobileNav.
        z-[55] > MobileNav z-[50] > sidebar z-40 > backdrop z-[45]
      */}
      {activeSessionId && isMobile && (
        <div
          className="fixed inset-x-0 z-[55] border-t border-border-default bg-bg-primary shadow-[0_-2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.4)]"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="p-3">
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
        </div>
      )}

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
