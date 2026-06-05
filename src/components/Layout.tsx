import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { useThemeStore } from '../store/themeStore';

export function Layout() {
  const { isDarkMode } = useThemeStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleResize = () => {
      const isMd = window.innerWidth >= 768;
      setIsSidebarOpen(isMd);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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