import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Plus, Settings, Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

interface SidebarProps {
  isSidebarOpen: boolean;
}

export function Sidebar({ isSidebarOpen }: SidebarProps) {
  const { isDarkMode, toggleDarkMode } = useThemeStore();

  if (!isSidebarOpen) return null;

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out z-40">
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <Home size={18} />
          <span className="font-medium">Home</span>
        </NavLink>

        <NavLink
          to="/sessions"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <MessageSquare size={18} />
          <span className="font-medium">Sessions</span>
        </NavLink>

        <NavLink
          to="/new"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <Plus size={18} />
          <span className="font-medium">New Session</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <Settings size={18} />
          <span className="font-medium">Settings</span>
        </NavLink>
      </nav>

      <div className="mt-auto p-3">
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="flex items-center justify-end">
            <button
              onClick={toggleDarkMode}
              className="flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-2 py-1 transition-colors duration-200"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? (
                <Sun className="h-6 w-6 text-yellow-500" />
              ) : (
                <Moon className="h-6 w-6 text-gray-500" />
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}