import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Plus, Settings } from 'lucide-react';

interface SidebarProps {
  isSidebarOpen: boolean;
}

export function Sidebar({ isSidebarOpen }: SidebarProps) {
  if (!isSidebarOpen) return null;

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-72 bg-bg-primary border-r border-border-default flex flex-col transition-all duration-300 ease-in-out z-40">
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-blue-500 text-white'
                : 'text-fg-secondary hover:bg-bg-muted'
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
                : 'text-fg-secondary hover:bg-bg-muted'
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
                : 'text-fg-secondary hover:bg-bg-muted'
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
                : 'text-fg-secondary hover:bg-bg-muted'
            }`
          }
        >
          <Settings size={18} />
          <span className="font-medium">Settings</span>
        </NavLink>
      </nav>
    </aside>
  );
}
