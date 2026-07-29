import { useState } from 'react';
import { format, addDays, startOfWeek, isToday } from 'date-fns';
import { bookings, clients, packages, employees } from '@/lib/mock-data';
import { Link } from 'wouter';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/status-badge';

export default function Calendar() {
  const [selectedDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'agenda'>('day');

  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const dayBookings = bookings
    .filter(b => b.date === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const upcomingBookings = bookings
    .filter(b => new Date(b.date) >= new Date())
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <Link href="/booking/new">
            <Button size="sm" data-testid="button-new-booking">
              <Plus className="w-4 h-4 mr-1" />
              New Booking
            </Button>
          </Link>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>

          <TabsContent value="day" className="mt-6">
            <div className="mb-4">
              <h2 className="text-[18px] font-semibold">{format(selectedDate, 'EEEE, MMMM d')}</h2>
            </div>
            <div className="space-y-2">
              {hours.map(hour => {
                const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                const bookingsAtHour = dayBookings.filter(b => b.startTime === hourStr);
                
                return (
                  <div key={hour} className="flex gap-3">
                    <div className="w-16 text-[13px] text-muted-foreground pt-1 shrink-0">
                      {format(new Date().setHours(hour, 0), 'h:mm a')}
                    </div>
                    <div className="flex-1">
                      {bookingsAtHour.map(booking => {
                        const client = clients.find(c => c.id === booking.clientId);
                        const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
                        const employee = employees.find(e => e.id === booking.employeeIds[0]);
                        
                        return (
                          <Link key={booking.id} href={`/booking/${booking.id}`}>
                            <Card
                              className="p-3 mb-2 border-l-4 rounded-xl hover:bg-muted transition-colors"
                              style={{ borderLeftColor: employee?.color }}
                              data-testid={`booking-${booking.id}`}
                            >
                              <div className="flex items-start justify-between mb-1">
                                <p className="font-medium text-[15px]">{client?.name}</p>
                                <StatusBadge status={booking.status} />
                              </div>
                              <p className="text-[13px] text-muted-foreground">
                                {pkgs.map(p => p.name).join(', ')}
                              </p>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="week" className="mt-6">
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayBookings = bookings.filter(b => b.date === dayStr);
                
                return (
                  <div key={dayStr} className="text-center">
                    <div className="mb-2">
                      <p className="text-[11px] text-muted-foreground uppercase">{format(day, 'EEE')}</p>
                      <p className={`text-[15px] font-medium ${isToday(day) ? 'text-primary' : ''}`}>
                        {format(day, 'd')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[13px] tabular-nums">{dayBookings.length}</p>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {dayBookings.slice(0, 3).map(b => {
                          const employee = employees.find(e => e.id === b.employeeIds[0]);
                          return (
                            <div
                              key={b.id}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: employee?.color }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="agenda" className="mt-6">
            <div className="space-y-4">
              {upcomingBookings.slice(0, 20).map((booking, index, arr) => {
                const client = clients.find(c => c.id === booking.clientId);
                const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
                const showDate = index === 0 || booking.date !== arr[index - 1].date;
                
                return (
                  <div key={booking.id}>
                    {showDate && (
                      <h3 className="text-[15px] font-semibold mb-2 text-muted-foreground">
                        {format(new Date(booking.date), 'EEEE, MMMM d')}
                      </h3>
                    )}
                    <Link href={`/booking/${booking.id}`}>
                      <Card className="p-4 border border-border rounded-xl hover:bg-muted transition-colors" data-testid={`booking-${booking.id}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-[15px]">{client?.name}</p>
                            <p className="text-[13px] text-muted-foreground">{booking.startTime}</p>
                          </div>
                          <StatusBadge status={booking.status} />
                        </div>
                        <p className="text-[15px] text-muted-foreground">
                          {pkgs.map(p => p.name).join(', ')}
                        </p>
                      </Card>
                    </Link>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
