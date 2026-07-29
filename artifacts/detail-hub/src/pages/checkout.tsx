import { bookings, clients, packages, updateBooking } from '@/lib/mock-data';
import { format, isToday } from 'date-fns';
import { Link } from 'wouter';
import { CheckCircle2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';

export default function Checkout() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayBookings = bookings
    .filter(b => b.date === today && (b.status === 'confirmed' || b.status === 'pending'))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleComplete = (bookingId: number) => {
    updateBooking(bookingId, { status: 'completed' });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-2">Checkout</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          Complete today's jobs
        </p>

        {todayBookings.length === 0 ? (
          <EmptyState icon={CalendarIcon} message="No jobs scheduled for today" />
        ) : (
          <div className="space-y-3">
            {todayBookings.map(booking => {
              const client = clients.find(c => c.id === booking.clientId);
              const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
              const total = pkgs.reduce((sum, p) => sum + p.price, 0);

              return (
                <Card key={booking.id} className="p-4 border border-border rounded-xl" data-testid={`booking-${booking.id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-[18px] font-semibold mb-1">{client?.name}</h3>
                      <p className="text-[13px] text-muted-foreground">{booking.startTime}</p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>

                  <div className="space-y-2 mb-4">
                    {pkgs.map(pkg => (
                      <div key={pkg.id} className="flex justify-between text-[15px]">
                        <span className="text-muted-foreground">{pkg.name}</span>
                        <span className="font-medium tabular-nums">${pkg.price}</span>
                      </div>
                    ))}
                    {booking.parkingCost > 0 && (
                      <div className="flex justify-between text-[15px]">
                        <span className="text-muted-foreground">Parking</span>
                        <span className="font-medium tabular-nums">${booking.parkingCost}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[15px] pt-2 border-t border-border">
                      <span className="font-medium">Total</span>
                      <span className="font-semibold tabular-nums">${(total + booking.parkingCost).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/booking/${booking.id}`} className="flex-1">
                      <Button variant="outline" className="w-full" data-testid={`button-view-${booking.id}`}>
                        View Details
                      </Button>
                    </Link>
                    <Button
                      onClick={() => handleComplete(booking.id)}
                      className="flex-1"
                      data-testid={`button-complete-${booking.id}`}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Complete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
