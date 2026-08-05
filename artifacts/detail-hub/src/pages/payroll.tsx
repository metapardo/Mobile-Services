import { useState } from 'react';
import { bookings, packages, employees, settings, clients } from '@/lib/mock-data';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, format } from 'date-fns';

export default function Payroll() {
  const [period, setPeriod] = useState<'current-week' | 'last-week' | 'month'>('current-week');
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const getPeriodRange = () => {
    const now = new Date();
    switch (period) {
      case 'current-week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'last-week':
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek), end: endOfWeek(lastWeek) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getPeriodRange();
  const periodBookings = bookings.filter(b => {
    const date = new Date(b.date);
    return date >= start && date <= end && b.status === 'completed';
  });

  const employeePayroll = employees.map(emp => {
    const empBookings = periodBookings.filter(b => b.employeeIds.includes(emp.id));
    
    let revenue = 0;
    let tips = 0;
    const bookingDetails: Array<{ booking: typeof bookings[0], revenue: number, commission: number, split: number }> = [];

    empBookings.forEach(b => {
      const pkgTotal = b.packageIds.reduce((s, id) => {
        const pkg = packages.find(p => p.id === id);
        return s + (pkg?.price || 0);
      }, 0);
      
      const split = b.employeeSplit.find(s => s.employeeId === emp.id);
      const splitPercentage = split?.percentage || 100;
      const employeeRevenue = (pkgTotal * splitPercentage) / 100;
      
      revenue += employeeRevenue;
      
      const commission = employeeRevenue * (settings.commissionRate / 100);
      
      bookingDetails.push({
        booking: b,
        revenue: employeeRevenue,
        commission,
        split: splitPercentage,
      });
    });

    const commission = revenue * (settings.commissionRate / 100);
    const totalPayout = commission + tips;

    return {
      employee: emp,
      revenue,
      tips,
      commission,
      totalPayout,
      bookingDetails,
    };
  });

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/more" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to More</span>
        </Link>

        <h1 className="text-2xl font-semibold mb-6">Team</h1>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="current-week">Current Week</TabsTrigger>
            <TabsTrigger value="last-week">Last Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {employeePayroll.map(({ employee, revenue, tips, commission, totalPayout, bookingDetails }) => {
            const isExpanded = expandedEmployee === employee.id;

            return (
              <Card key={employee.id} className="border border-border rounded-xl overflow-hidden" data-testid={`employee-${employee.id}`}>
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : employee.id)}
                  className="w-full p-4 text-left hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: employee.color }} />
                      <p className="text-[18px] font-semibold">{employee.name}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase mb-0.5">Revenue</p>
                      <p className="text-[15px] font-medium tabular-nums">${revenue.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase mb-0.5">Tips</p>
                      <p className="text-[15px] font-medium tabular-nums">${tips.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase mb-0.5">Commission</p>
                      <p className="text-[15px] font-medium tabular-nums">${commission.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase mb-0.5">Total</p>
                      <p className="text-[15px] font-semibold tabular-nums">${totalPayout.toFixed(2)}</p>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <h3 className="text-[13px] font-medium text-muted-foreground mb-3 uppercase">Booking Breakdown</h3>
                    <div className="space-y-2">
                      {bookingDetails.map(({ booking, revenue, commission, split }) => {
                        const client = clients.find(c => c.id === booking.clientId);
                        const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
                        
                        return (
                          <div key={booking.id} className="p-3 bg-card rounded-lg border border-border">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="text-[15px] font-medium">{client?.name}</p>
                                <p className="text-[13px] text-muted-foreground">
                                  {format(new Date(booking.date), 'MMM d, yyyy')}
                                </p>
                              </div>
                              {split < 100 && (
                                <span className="text-[13px] text-muted-foreground">{split}% split</span>
                              )}
                            </div>
                            <p className="text-[13px] text-muted-foreground mb-2">
                              {pkgs.map(p => p.name).join(', ')}
                            </p>
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Revenue</span>
                              <span className="tabular-nums">${revenue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Commission ({settings.commissionRate}%)</span>
                              <span className="font-medium tabular-nums">${commission.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
