import { Home, Calendar, CheckSquare, Users, MoreHorizontal } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import logoSrc from '@assets/Group_3038_1785336419342.png';

export function SidebarNav() {
  const [location] = useLocation();

  const tabs = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Checkout', path: '/checkout', icon: CheckSquare },
    { name: 'Clients', path: '/clients', icon: Users },
    { name: 'More', path: '/more', icon: MoreHorizontal },
  ];

  const isActive = (path: string) => {
    if (path === '/home') return location === '/' || location === '/home';
    return location.startsWith(path);
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex-col">
      <div className="p-6 flex items-center gap-3">
        <img
          src={logoSrc}
          alt="DetailHub logo"
          className="w-8 h-8 object-contain"
          style={{ mixBlendMode: 'multiply' }}
          data-testid="img-sidebar-logo"
        />
        <h1 className="text-xl font-bold">DetailHub</h1>
      </div>
      <nav className="flex-1 px-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                active ? 'bg-[var(--accent-subtle)] text-primary' : 'text-foreground hover:bg-muted'
              }`}
              data-testid={`nav-${tab.name.toLowerCase()}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[15px]">{tab.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
