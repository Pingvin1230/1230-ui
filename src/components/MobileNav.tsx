import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, MessageSquare, Plus } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

export function MobileNav() {
  const { t } = useTranslation();
  const location = useLocation();

  const ITEMS: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/sessions', label: t('nav.sessions'), icon: MessageSquare },
    { to: '/new', label: t('nav.new'), icon: Plus },
  ];
  const isChat = location.pathname.startsWith('/chat/');

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-[50] border-t border-border-default bg-bg-primary pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="flex items-center gap-1 px-3 h-[50px] w-full max-w-4xl mx-auto">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1 flex justify-center">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => {
                // On /chat/:id highlight Sessions as the parent section
                const active = isActive || (to === '/sessions' && isChat);
                return `flex items-center justify-center gap-1.5 h-9 rounded-xl transition-all text-sm font-medium ${
                  active
                    ? 'bg-accent/10 text-accent px-3'
                    : 'text-fg-muted hover:text-fg-primary w-9'
                }`;
              }}
            >
              {({ isActive }) => {
                const active = isActive || (to === '/sessions' && isChat);
                return (
                  <>
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {active && <span className="whitespace-nowrap">{label}</span>}
                  </>
                );
              }}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
