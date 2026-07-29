import { format, isToday } from 'date-fns';
import { bookings, clients, packages, employees } from '@/lib/mock-data';
import { Link } from 'wouter';
import { Calendar, DollarSign, Users, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

export default function Home() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayBookings = bookings.filter(b => b.date === today);
  const upcomingBookings = bookings
    .filter(b => new Date(b.date) >= new Date() && b.status !== 'cancelled' && b.status !== 'no-show')
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
  
  const nextBooking = upcomingBookings[0];
  const nextClient = nextBooking ? clients.find(c => c.id === nextBooking.clientId) : null;
  const nextPackages = nextBooking ? nextBooking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean) : [];

  const todayRevenue = todayBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => {
      const pkgTotal = b.packageIds.reduce((s, id) => {
        const pkg = packages.find(p => p.id === id);
        return s + (pkg?.price || 0);
      }, 0);
      return sum + pkgTotal;
    }, 0);

  const quickActions = [
    { label: 'New Booking', path: '/booking/new', icon: Calendar },
    { label: 'Reports', path: '/more/reporting', icon: FileText },
    { label: 'Clients', path: '/clients', icon: Users },
    { label: 'Payroll', path: '/more/payroll', icon: DollarSign },
  ];

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">{format(new Date(), 'EEEE, MMMM d')}</h1>
          <p className="text-[15px] text-muted-foreground">Good morning</p>
        </div>

        {nextBooking && nextClient && (
          <Link href={`/booking/${nextBooking.id}`}>
            <Card className="p-4 mb-6 border border-border rounded-xl hover:bg-muted transition-colors" data-testid="card-next-booking">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[13px] text-muted-foreground mb-1">Next up</p>
                  <h3 className="text-[18px] font-semibold">{nextClient.name}</h3>
                </div>
                <StatusBadge status={nextBooking.status} />
              </div>
              <div className="space-y-1">
                <p className="text-[15px] text-muted-foreground">
                  {nextPackages.map(p => p.name).join(', ')}
                </p>
                <p className="text-[15px] text-muted-foreground">
                  {isToday(new Date(nextBooking.date)) ? 'Today' : format(new Date(nextBooking.date), 'MMM d')} at {nextBooking.startTime}
                </p>
              </div>
            </Card>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-jobs-today">
            <p className="text-[13px] text-muted-foreground mb-1">Jobs Today</p>
            <p className="text-2xl font-semibold tabular-nums">{todayBookings.length}</p>
          </Card>
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-revenue-today">
            <p className="text-[13px] text-muted-foreground mb-1">Revenue Today</p>
            <p className="text-2xl font-semibold tabular-nums">${todayRevenue.toFixed(2)}</p>
          </Card>
        </div>

        <div>
          <h2 className="text-[18px] font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.path} href={action.path}>
                  <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors" data-testid={`action-${action.label.toLowerCase().replace(' ', '-')}`}>
                    <Icon className="w-5 h-5 mb-2 text-primary" />
                    <p className="text-[15px] font-medium">{action.label}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
