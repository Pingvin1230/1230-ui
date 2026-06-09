import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, MessageSquare, Plus, Settings } from 'lucide-react';
import { useMobile } from '../hooks/useMobile';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

export function MobileNav() {
  const { t } = useTranslation();
  const isMobile = useMobile();

  const ITEMS: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/sessions', label: t('nav.sessions'), icon: MessageSquare },
    { to: '/new', label: t('nav.new'), icon: Plus },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-[50] border-t border-border-default bg-bg-primary pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="flex items-stretch justify-around">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${
                  isActive
                    ? 'text-accent'
                    : 'text-fg-muted hover:text-fg-primary'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
