import { Home, Calendar, CheckSquare, Users, MoreHorizontal } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function BottomNav() {
  const [location] = useLocation();

  const tabs = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Checkout', path: '/checkout', icon: CheckSquare },
    { name: 'Clients', path: '/clients', icon: Users },
    { name: 'More', path: '/more', icon: MoreHorizontal },
  ];

  const isActive = (path: string) => {
    if (path === '/calendar') return location === '/' || location === '/calendar';
    return location.startsWith(path);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-nav z-50">
      <div className="grid grid-cols-5 h-16 safe-pb">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
              data-testid={`nav-${tab.name.toLowerCase()}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] leading-none">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
