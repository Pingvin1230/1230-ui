import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, MessageSquare, Plus, Settings, Sun, Moon, Bell, BellOff } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useNotificationsStore } from '../store/notificationsStore';

interface SidebarProps {
  isSidebarOpen: boolean;
  isMobile: boolean;
}

export function Sidebar({ isSidebarOpen, isMobile }: SidebarProps) {
  const { t } = useTranslation();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { enabled: notificationsEnabled, toggle: toggleNotifications } = useNotificationsStore();

  const handleNotificationsToggle = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result === 'granted') toggleNotifications();
    } else if (Notification.permission === 'granted') {
      toggleNotifications();
    }
  };

  if (!isSidebarOpen) return null;

  const inner = (
    <aside className="flex flex-col w-72 h-full bg-bg-primary border-r border-border-default">
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive ? 'bg-blue-500 text-white' : 'text-fg-secondary hover:bg-bg-muted'
            }`
          }
        >
          <Home size={18} />
          <span className="font-medium">{t('nav.home')}</span>
        </NavLink>

        <NavLink
          to="/sessions"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive ? 'bg-blue-500 text-white' : 'text-fg-secondary hover:bg-bg-muted'
            }`
          }
        >
          <MessageSquare size={18} />
          <span className="font-medium">{t('nav.sessions')}</span>
        </NavLink>

        <NavLink
          to="/new"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive ? 'bg-blue-500 text-white' : 'text-fg-secondary hover:bg-bg-muted'
            }`
          }
        >
          <Plus size={18} />
          <span className="font-medium">{t('nav.new')}</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive ? 'bg-blue-500 text-white' : 'text-fg-secondary hover:bg-bg-muted'
            }`
          }
        >
          <Settings size={18} />
          <span className="font-medium">{t('nav.settings')}</span>
        </NavLink>
      </nav>

      <div className="flex-shrink-0 px-3 py-3 border-t border-border-default flex flex-col items-center">
        <div className="flex items-center justify-center gap-1 w-full pb-2 mb-2 border-b border-border-default">
          <button
            type="button"
            onClick={handleNotificationsToggle}
            className={`p-1.5 rounded transition-colors ${
              notificationsEnabled
                ? 'text-blue-600 dark:text-blue-400 hover:bg-bg-secondary'
                : 'text-fg-muted hover:bg-bg-secondary'
            }`}
            aria-label={notificationsEnabled ? t('nav.disableNotifications') : t('nav.enableNotifications')}
            title={notificationsEnabled ? t('nav.notificationsOn') : t('nav.notificationsOff')}
          >
            {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="p-1.5 rounded text-fg-muted hover:bg-bg-secondary transition-colors"
            aria-label={t('nav.toggleDarkMode')}
            title={t('nav.toggleDarkMode')}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <a
          href="https://github.com/Pingvin1230/1230-ui"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          className="text-fg-secondary hover:text-fg-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
        <p className="mt-2 text-xs text-fg-muted">{t('common.copyright')}</p>
      </div>
    </aside>
  );

  // On mobile: fixed overlay (positioned by Layout's backdrop + z-index)
  // On desktop: part of the flex row flow — naturally pushes content right
  if (isMobile) {
    return (
      <div className="fixed left-0 top-0 bottom-0 z-40 flex flex-col" style={{ paddingTop: '64px' }}>
        {inner}
      </div>
    );
  }

  return inner;
}
