import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, MessageSquare, Plus, Settings } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

export function MobileNav() {
  const { t } = useTranslation();

  const ITEMS: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/sessions', label: t('nav.sessions'), icon: MessageSquare },
    { to: '/new', label: t('nav.new'), icon: Plus },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-primary border-t border-border-default"
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
