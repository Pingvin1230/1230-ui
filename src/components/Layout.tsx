import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { useThemeStore } from '../store/themeStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export function Layout() {
  const { isDarkMode } = useThemeStore();
  const isSidebarOpen = useSidebarStore((s) => s.isOpen);
  const setIsSidebarOpen = useSidebarStore((s) => s.setOpen);
  const navigate = useNavigate();

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

  const mainMarginLeft = isSidebarOpen ? 'md:ml-72' : 'md:ml-0';

  return (
    <div className="min-h-screen bg-bg-secondary">
      <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <Sidebar isSidebarOpen={isSidebarOpen} />
      <div className={`transition-all duration-300 ease-in-out ${mainMarginLeft} h-screen flex flex-col`}>
        <div className="flex-1 flex flex-col pt-16 overflow-hidden pb-14 md:pb-0">
          <div className="w-full h-full overflow-auto">
            <Outlet />
          </div>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}