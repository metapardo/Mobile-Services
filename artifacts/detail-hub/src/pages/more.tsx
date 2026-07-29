import { Link } from 'wouter';
import { BarChart3, Package, DollarSign, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function More() {
  const menuItems = [
    {
      name: 'Sales Reporting',
      path: '/more/reporting',
      icon: BarChart3,
      description: 'Revenue and performance analytics',
    },
    {
      name: 'Package Admin',
      path: '/more/packages',
      icon: Package,
      description: 'Manage service packages',
    },
    {
      name: 'Payroll',
      path: '/more/payroll',
      icon: DollarSign,
      description: 'Employee commissions and payouts',
    },
    {
      name: 'Settings',
      path: '/more/settings',
      icon: Settings,
      description: 'App configuration',
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-6">More</h1>

        <div className="space-y-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors" data-testid={`link-${item.name.toLowerCase().replace(' ', '-')}`}>
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
      </div>
    </div>
  );
}
