import { useState, useRef, useEffect } from 'react';
import { format, addDays, addWeeks, subWeeks, startOfWeek, isToday, isSameDay } from 'date-fns';
import { bookings, clients, packages, employees, settings } from '@/lib/mock-data';
import { Link } from 'wouter';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { computeFuelGauge } from '@/lib/fuel-gauge';
import { FuelGaugeIcon } from '@/components/fuel-gauge-icon';
import { PaymentMethodBadge } from '@/components/payment-method-badge';

const HOUR_HEIGHT = 64; // px per hour
const GRID_START_HOUR = 7; // 7 AM
const GRID_END_HOUR = 21;  // 9 PM
const GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR;

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const minutesFromStart = (now.getHours() - GRID_START_HOUR) * 60 + now.getMinutes();
      const scrollTo = (minutesFromStart / 60) * HOUR_HEIGHT - 120;
      scrollRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, []);

  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const selectedStr = format(selectedDate, 'yyyy-MM-dd');
  const dayBookings = bookings
    .filter(b => b.date === selectedStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hours = Array.from({ length: GRID_HOURS }, (_, i) => GRID_START_HOUR + i);

  // Current time position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = GRID_START_HOUR * 60;
  const nowTopPx = ((nowMinutes - startMinutes) / 60) * HOUR_HEIGHT;

  function prevWeek() {
    const prev = subWeeks(weekAnchor, 1);
    setWeekAnchor(prev);
  }
  function nextWeek() {
    const next = addWeeks(weekAnchor, 1);
    setWeekAnchor(next);
  }
  function goToday() {
    const today = new Date();
    setSelectedDate(today);
    setWeekAnchor(today);
  }

  return (
    <div className="min-h-[100dvh] pb-20 md:pb-6 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="text-[17px] font-semibold tracking-tight hover:text-primary transition-colors">
            {format(selectedDate, 'MMMM yyyy')}
          </button>
          <button
            onClick={nextWeek}
            className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* New booking button */}
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full gradient-btn text-white shadow-lg"
            data-testid="button-new-booking"
          >
            <Plus className="w-5 h-5" />
          </button>
          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNewMenu(false)} />
              <div className="absolute right-0 top-11 z-50 glass rounded-2xl overflow-hidden min-w-[200px] py-1 shadow-2xl">
                <Link href="/booking/new" onClick={() => setShowNewMenu(false)}>
                  <div className="px-5 py-3.5 text-[15px] font-medium hover:bg-white/10 transition-colors cursor-pointer">
                    Create appointment
                  </div>
                </Link>
                <div className="h-px bg-white/10 mx-4" />
                <div className="px-5 py-3.5 text-[15px] font-medium text-muted-foreground cursor-default">
                  Create class
                </div>
                <div className="h-px bg-white/10 mx-4" />
                <div className="px-5 py-3.5 text-[15px] font-medium text-muted-foreground cursor-default">
                  Create personal event
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Week strip ── */}
      <div className="px-3 pb-2 shrink-0">
        <div className="grid grid-cols-7">
          {weekDays.map(day => {
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            const hasBkgs = bookings.some(b => b.date === format(day, 'yyyy-MM-dd'));
            return (
              <button
                key={day.toISOString()}
                onClick={() => { setSelectedDate(day); setWeekAnchor(day); }}
                className="flex flex-col items-center gap-0.5 py-1"
              >
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {format(day, 'EEEEE')}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-[15px] font-semibold transition-colors
                  ${selected
                    ? 'bg-primary text-white'
                    : today
                      ? 'text-primary'
                      : 'text-foreground'
                  }`}>
                  {format(day, 'd')}
                </span>
                {/* Dot indicator if day has bookings */}
                <span className={`w-1 h-1 rounded-full ${hasBkgs ? 'bg-primary/60' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/10 shrink-0" />

      {/* ── Scrollable time grid ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="relative"
          style={{ height: `${GRID_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Hour rows */}
          {hours.map(hour => (
            <div
              key={hour}
              className="absolute w-full flex items-start"
              style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <div className="w-14 shrink-0 text-right pr-3 text-[11px] font-medium text-muted-foreground select-none"
                style={{ marginTop: '-7px' }}>
                {format(new Date(2000, 0, 1, hour, 0), 'h a')}
              </div>
              <div className="flex-1 border-t border-white/8 h-full" />
            </div>
          ))}

          {/* Half-hour tick lines */}
          {hours.map(hour => (
            <div
              key={`half-${hour}`}
              className="absolute w-full flex items-start pointer-events-none"
              style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
            >
              <div className="w-14 shrink-0" />
              <div className="flex-1 border-t border-white/[0.04]" />
            </div>
          ))}

          {/* ── Current time indicator ── */}
          {isToday(selectedDate) && nowTopPx >= 0 && nowTopPx <= GRID_HOURS * HOUR_HEIGHT && (
            <div
              className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: `${nowTopPx}px` }}
            >
              <div className="w-14 shrink-0 flex justify-end pr-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
              </div>
              <div className="flex-1 h-[1.5px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
            </div>
          )}

          {/* ── Booking blocks ── */}
          {dayBookings.map(booking => {
            const [h, m] = booking.startTime.split(':').map(Number);
            const topPx = ((h * 60 + m - startMinutes) / 60) * HOUR_HEIGHT;
            const client = clients.find(c => c.id === booking.clientId);
            const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
            const employee = employees.find(e => e.id === booking.employeeIds[0]);
            const totalDuration = pkgs.reduce((sum, p) => sum + p.durationMinutes, 0) || 90;
            const heightPx = Math.max((totalDuration / 60) * HOUR_HEIGHT, 40);

            const gauge = computeFuelGauge(
              booking, bookings, packages,
              settings.homeAddress,
              {
                fuelGaugeHalfMi:  settings.fuelGaugeHalfMi,
                fuelGaugeFullMi:  settings.fuelGaugeFullMi,
                fuelGaugeHalfMin: settings.fuelGaugeHalfMin,
                fuelGaugeFullMin: settings.fuelGaugeFullMin,
              },
            );

            return (
              <Link key={booking.id} href={`/booking/${booking.id}`}>
                <div
                  className="absolute z-10 rounded-xl overflow-hidden cursor-pointer hover:brightness-110 transition-all"
                  style={{
                    top: `${topPx + 2}px`,
                    height: `${heightPx - 4}px`,
                    left: '60px',
                    right: '12px',
                    background: `${employee?.color ?? '#3654FF'}22`,
                    borderLeft: `3px solid ${employee?.color ?? '#3654FF'}`,
                    backdropFilter: 'blur(8px)',
                  }}
                  data-testid={`booking-${booking.id}`}
                >
                  <div className="px-2 pt-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[13px] font-semibold leading-tight truncate" style={{ color: employee?.color }}>
                        {client?.name}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <FuelGaugeIcon result={gauge} clientName={client?.name} />
                        {booking.paymentMethod && (
                          <PaymentMethodBadge method={booking.paymentMethod} size="xs" />
                        )}
                        <StatusBadge status={booking.status} />
                      </div>
                    </div>
                    {heightPx >= 50 && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {booking.startTime} · {pkgs.map(p => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Empty state for days with no bookings */}
          {dayBookings.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
              style={{ top: `${2 * HOUR_HEIGHT}px`, bottom: `${2 * HOUR_HEIGHT}px`, left: '60px', right: '12px' }}>
              <p className="text-muted-foreground text-[14px]">No appointments</p>
              <p className="text-muted-foreground/50 text-[12px] mt-1">Tap + to schedule one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
