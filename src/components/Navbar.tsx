import { Link, useSearchParams } from 'react-router-dom';
import { useRef, useEffect, useState, type ChangeEvent } from 'react';
import { Settings, LogOut, Search, Sun, Moon, Bell, BellOff } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useSearchStore } from '../store/searchStore';

interface NavbarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

export function Navbar({ isSidebarOpen, setIsSidebarOpen }: NavbarProps) {
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, setSearchParams] = useSearchParams();
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const [localInput, setLocalInput] = useState(query);
  const debounceRef = useRef<number | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('notificationsEnabled') === 'true'
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (query) next.set('q', query);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [query, setSearchParams]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalInput(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setQuery(value);
    }, 250);
  };

  const handleNotificationsToggle = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result === 'granted') setNotificationsEnabled(true);
    } else if (Notification.permission === 'granted') {
      setNotificationsEnabled(prev => !prev);
    } else {
      setNotificationsEnabled(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-bg-primary text-fg-primary shadow-md">
      <div className="h-16 flex items-center justify-between">
        <div
          className={`${isSidebarOpen ? 'sm:w-72' : 'w-auto sm:w-16'} flex items-center ${isSidebarOpen ? 'sm:justify-center' : 'sm:justify-start'} transition-all duration-300 ease-in-out px-4 relative flex-shrink-0`}
        >
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`flex items-center text-fg-muted ${isSidebarOpen ? 'sm:absolute sm:left-4' : 'sm:relative'}`}
            aria-label={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <Link to="/" className="flex items-center no-underline ml-2 sm:ml-0">
            <span className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              1230.UI
            </span>
          </Link>
        </div>

        <div className="hidden md:flex flex-1 justify-center px-4">
          <div className="w-full max-w-md relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              value={localInput}
              onChange={handleSearchChange}
              placeholder="Search sessions..."
              aria-label="Search sessions"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border-default bg-bg-secondary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-6 lg:px-8 flex-shrink-0">
          <button
            type="button"
            onClick={handleNotificationsToggle}
            className={`p-1.5 rounded transition-colors ${
              notificationsEnabled
                ? 'text-blue-600 dark:text-blue-400 hover:bg-bg-secondary'
                : 'text-fg-muted hover:bg-bg-secondary'
            }`}
            aria-label={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
            title={notificationsEnabled ? 'Notifications on' : 'Notifications off'}
          >
            {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-1.5 rounded text-fg-muted hover:bg-bg-secondary transition-colors"
            aria-label="Toggle Dark Mode"
            title="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center"
              aria-label="User Menu"
            >
              <div className="h-8 w-8 rounded-full border-2 border-green-500 bg-bg-muted flex items-center justify-center">
                <span className="text-sm font-medium text-fg-secondary">U</span>
              </div>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 min-w-48 bg-bg-primary rounded-md shadow-lg py-1 border border-border-default">
                <Link
                  to="/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
                <hr className="my-1 border-border-default" />
                <button
                  onClick={() => setIsDropdownOpen(false)}
                  className="w-full flex items-center text-left px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
