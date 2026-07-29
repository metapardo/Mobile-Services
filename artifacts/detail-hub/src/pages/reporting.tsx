import { useState } from 'react';
import { bookings, packages, employees } from '@/lib/mock-data';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export default function Reporting() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');

  const getPeriodRange = () => {
    const now = new Date();
    switch (period) {
      case 'week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) };
    }
  };

  const { start, end } = getPeriodRange();
  const periodBookings = bookings.filter(b => {
    const date = new Date(b.date);
    return date >= start && date <= end && b.status === 'completed';
  });

  const totalRevenue = periodBookings.reduce((sum, b) => {
    const pkgTotal = b.packageIds.reduce((s, id) => {
      const pkg = packages.find(p => p.id === id);
      return s + (pkg?.price || 0);
    }, 0);
    return sum + pkgTotal;
  }, 0);

  const jobsCompleted = periodBookings.length;

  const avgTicket = jobsCompleted > 0 ? totalRevenue / jobsCompleted : 0;

  const newClients = new Set(periodBookings.map(b => b.clientId)).size;

  // Revenue by employee
  const revenueByEmployee = employees.map(emp => {
    const empBookings = periodBookings.filter(b => b.employeeIds.includes(emp.id));
    const revenue = empBookings.reduce((sum, b) => {
      const pkgTotal = b.packageIds.reduce((s, id) => {
        const pkg = packages.find(p => p.id === id);
        return s + (pkg?.price || 0);
      }, 0);
      const split = b.employeeSplit.find(s => s.employeeId === emp.id);
      return sum + (pkgTotal * (split?.percentage || 100) / 100);
    }, 0);
    return { name: emp.name.split(' ')[0], revenue };
  });

  // Revenue by package
  const packageRevenue: Record<string, number> = {};
  periodBookings.forEach(b => {
    b.packageIds.forEach(pkgId => {
      const pkg = packages.find(p => p.id === pkgId);
      if (pkg) {
        packageRevenue[pkg.name] = (packageRevenue[pkg.name] || 0) + pkg.price;
      }
    });
  });

  const revenueByPackage = Object.entries(packageRevenue)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link href="/more" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to More</span>
        </Link>

        <h1 className="text-2xl font-semibold mb-6">Sales Reporting</h1>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
            <TabsTrigger value="year">This Year</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-total-revenue">
            <p className="text-[13px] text-muted-foreground mb-1">Total Revenue</p>
            <p className="text-2xl font-bold tabular-nums">${totalRevenue.toFixed(2)}</p>
          </Card>
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-jobs-completed">
            <p className="text-[13px] text-muted-foreground mb-1">Jobs Completed</p>
            <p className="text-2xl font-bold tabular-nums">{jobsCompleted}</p>
          </Card>
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-avg-ticket">
            <p className="text-[13px] text-muted-foreground mb-1">Avg Ticket</p>
            <p className="text-2xl font-bold tabular-nums">${avgTicket.toFixed(2)}</p>
          </Card>
          <Card className="p-4 border border-border rounded-xl" data-testid="stat-new-clients">
            <p className="text-[13px] text-muted-foreground mb-1">New Clients</p>
            <p className="text-2xl font-bold tabular-nums">{newClients}</p>
          </Card>
        </div>

        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-4">Revenue by Employee</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueByEmployee} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 border border-border rounded-xl">
          <h2 className="text-[18px] font-semibold mb-4">Revenue by Package</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueByPackage} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" width={100} />
              <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
