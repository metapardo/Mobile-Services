import { Link } from 'wouter';
import { BarChart3, Package, Users2, Settings, LogOut, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useLogout } from '@/hooks/use-logout';

export default function More() {
  const logoutMutation = useLogout();
  const menuItems = [
    {
      name: 'Team',
      path: '/more/payroll',
      icon: Users2,
      description: 'Employee commissions and payouts',
    },
    {
      name: 'Packages',
      path: '/more/packages',
      icon: Package,
      description: 'Manage service packages',
    },
    {
      name: 'Settings',
      path: '/more/settings',
      icon: Settings,
      description: 'App configuration',
    },
    {
      name: 'Reports',
      path: '/more/reporting',
      icon: BarChart3,
      description: 'Revenue and performance analytics',
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-6">More</h1>

        <div className="space-y-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <Card
                  className="p-4 border border-border rounded-xl hover:bg-muted transition-colors"
                  data-testid={`link-${item.name.toLowerCase().replace(' ', '-')}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[15px] font-medium">{item.name}</p>
                      <p className="text-[13px] text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="h-px bg-border/50 my-4" />

        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full disabled:opacity-60"
          data-testid="button-logout"
        >
          <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                {logoutMutation.isPending ? (
                  <Loader2 className="w-5 h-5 text-destructive animate-spin" />
                ) : (
                  <LogOut className="w-5 h-5 text-destructive" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-medium text-destructive">
                  {logoutMutation.isPending ? 'Logging out…' : 'Log Out'}
                </p>
                <p className="text-[13px] text-muted-foreground">End your current session</p>
              </div>
            </div>
          </Card>
        </button>
      </div>
    </div>
  );
}
