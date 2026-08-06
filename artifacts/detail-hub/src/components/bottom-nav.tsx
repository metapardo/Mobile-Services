import { Calendar, Users, DollarSign, BarChart3, Menu } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function BottomNav() {
  const [location] = useLocation();

  const tabs = [
    { name: 'Calendar', path: '/calendar',        icon: Calendar     },
    { name: 'Clients',  path: '/clients',          icon: Users        },
    { name: 'Checkout', path: '/checkout',         icon: DollarSign   },
    { name: 'Reports',  path: '/more/reporting',   icon: BarChart3    },
    { name: 'More',     path: '/more',             icon: Menu         },
  ];

  const isActive = (path: string) => {
    if (path === '/calendar') return location === '/' || location === '/calendar';
    // Checkout tab lights up for /checkout and sub-pages
    if (path === '/checkout') return location.startsWith('/checkout');
    // More tab: any /more/* except /more/reporting
    if (path === '/more') {
      return (
        location === '/more' ||
        (location.startsWith('/more') && !location.startsWith('/more/reporting'))
      );
    }
    return location.startsWith(path);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-nav z-50">
      <div className="grid grid-cols-5 h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
              data-testid={`nav-${tab.name.toLowerCase()}`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="text-[9px] leading-none">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
