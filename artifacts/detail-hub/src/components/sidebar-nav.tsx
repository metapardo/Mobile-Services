import { Calendar, Users, DollarSign, Users2, BarChart3, Package, Settings } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function SidebarNav() {
  const [location] = useLocation();

  const tabs = [
    { name: 'Calendar',  path: '/calendar',        icon: Calendar    },
    { name: 'Clients',   path: '/clients',          icon: Users       },
    { name: 'Checkout',  path: '/checkout',         icon: DollarSign  },
    { name: 'Team',      path: '/more/payroll',     icon: Users2      },
    { name: 'Reports',   path: '/more/reporting',   icon: BarChart3   },
    { name: 'Packages',  path: '/more/packages',    icon: Package     },
    { name: 'Settings',  path: '/more/settings',    icon: Settings    },
  ];

  const isActive = (path: string) => {
    if (path === '/calendar') return location === '/' || location === '/calendar';
    return location.startsWith(path);
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 glass-nav border-r border-white/10 flex-col">
      <div className="p-6 flex items-center gap-3">
        <h1 className="text-xl font-bold">RareAir</h1>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          const showDivider = i === 3; // divider before Team
          return (
            <div key={tab.path}>
              {showDivider && <div className="h-px bg-white/10 mx-2 my-2" />}
              <Link
                href={tab.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active ? 'bg-[var(--accent-subtle)] text-primary' : 'text-foreground hover:bg-muted'
                }`}
                data-testid={`nav-${tab.name.toLowerCase()}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[15px]">{tab.name}</span>
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
