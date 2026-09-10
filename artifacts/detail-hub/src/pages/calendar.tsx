import { useState, useRef, useEffect } from 'react';
import { format, addDays, addWeeks, subWeeks, startOfWeek, startOfDay, isToday, isSameDay, isBefore } from 'date-fns';
import { adaptBooking } from '@/lib/api-adapters';
import { useListBookings, useListClients, useListEmployees, useListPackages, getListBookingsQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Plus, ChevronLeft, ChevronRight, CalendarPlus, Loader2, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import type { FuelGaugeResult } from '@/lib/fuel-gauge';
import { FuelGaugeIcon } from '@/components/fuel-gauge-icon';
import { PaymentMethodBadge } from '@/components/payment-method-badge';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@workspace/blue-glass-design-system/components/ui/dropdown-menu';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/blue-glass-design-system/components/ui/empty';

const HOUR_HEIGHT = 64; // px per hour
const GRID_START_HOUR = 7; // 7 AM
const GRID_END_HOUR = 21;  // 9 PM
const GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR;

/**
 * PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md — minimal Phase 1 compatibility
 * fix (FR-23 itself, the calendar drive-time display rework, is explicitly
 * Phase 2). `computeFuelGauge` is now async and needs real coordinates on
 * both the target booking and its anchor; building batched/async gauge
 * fetching for an entire calendar grid without N duplicate route calls per
 * render is real Phase 2/3 infrastructure (it needs the route cache from
 * §9.2 to be viable at scale), not a Phase 1 change. So for now every
 * booking on the calendar renders this same static Unknown reading,
 * synchronously, with zero API calls — including bookings that *do* have
 * real coordinates. Once FR-23 is built those get their real Strong/Fair/
 * Weak treatment; this is a known, deliberate tradeoff, not a bug.
 */
const CALENDAR_UNSCORED_GAUGE: FuelGaugeResult = {
  grade: 'unknown',
  reason: 'not-computed',
  servicePrice: 0,
  youKeep: 0,
  travelLoad: 0,
  fuelCost: 0,
  roundTripMiles: 0,
  driveCost: 0,
  roundTripMinutes: 0,
  anchorAddress: '',
  anchorType: 'home',
};

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekAnchor, setWeekAnchor] = useState(new Date());
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
  const weekEnd = addDays(weekStart, 6);

  const selectedStr = format(selectedDate, 'yyyy-MM-dd');

  // ── Real data ──────────────────────────────────────────────────────────────
  // Scoped to the visible week — FR-10's whole reason for a `start`/`end` list
  // query is so the calendar doesn't fetch every booking an organization has
  // ever made just to render one week.
  const weekBookingsQuery = useListBookings({
    start: format(weekStart, 'yyyy-MM-dd'),
    end: format(weekEnd, 'yyyy-MM-dd'),
  });
  // `includeArchived`/`includeInactive` so a booking that references a client/
  // package/employee retired *after* the booking was made still resolves to a real
  // name here instead of `undefined` — soft-delete exists specifically so historical
  // bookings keep valid, displayable references (PRD Section 8/Edge Cases).
  const clientsQuery = useListClients({ includeArchived: true });
  const packagesQuery = useListPackages({ includeArchived: true });
  const employeesQuery = useListEmployees({ includeInactive: true });

  const weekBookingsLoaded = weekBookingsQuery.data ?? [];
  const hasWeekBookings = weekBookingsLoaded.length > 0;

  // A brand-new organization has zero bookings, period — distinct from "no
  // bookings this particular week" (a returning org just looking at a slow
  // week). Only fall back to an unscoped "has this org ever booked anything"
  // check once the visible week's own (cheap, scoped) query has already come
  // back empty — orgs with a normal, populated calendar never pay for this
  // extra request.
  const allBookingsCheckQuery = useListBookings(undefined, {
    query: {
      queryKey: getListBookingsQueryKey(),
      enabled: !weekBookingsQuery.isLoading && !weekBookingsQuery.isError && !hasWeekBookings,
    },
  });

  const stillDeterminingEmptiness =
    weekBookingsQuery.isLoading ||
    (!weekBookingsQuery.isError && !hasWeekBookings && allBookingsCheckQuery.isLoading);

  const hasNoBookingsAtAll =
    !weekBookingsQuery.isLoading &&
    !weekBookingsQuery.isError &&
    !hasWeekBookings &&
    !allBookingsCheckQuery.isLoading &&
    !allBookingsCheckQuery.isError &&
    (allBookingsCheckQuery.data?.length ?? 0) === 0;

  const clients = clientsQuery.data ?? [];
  const packages = packagesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const weekBookings = weekBookingsLoaded.map(adaptBooking);

  const dayBookings = weekBookings
    .filter(b => b.date === selectedStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hours = Array.from({ length: GRID_HOURS }, (_, i) => GRID_START_HOUR + i);

  // Current time position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = GRID_START_HOUR * 60;
  const nowTopPx = ((nowMinutes - startMinutes) / 60) * HOUR_HEIGHT;

  // BUG-9: the viewed day itself is before today — every empty-slot cell on
  // it is inert, regardless of time of day. Computed once per render rather
  // than per-cell since it doesn't depend on the cell's hour/minute.
  const selectedDayIsPast = isBefore(startOfDay(selectedDate), startOfDay(now));

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

  const loadFailed = weekBookingsQuery.isError || clientsQuery.isError || packagesQuery.isError || employeesQuery.isError;

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

        {/* New booking button — BUG-1 (`BUGS_Mobull_2026-09-10.md`): the
            design-system `DropdownMenu` primitive replaces the old hand-rolled
            `fixed inset-0` overlay + positioned panel, which inherited none of
            the system's tokens, dismissal, or focus handling. "Create class"
            is removed entirely (Mobull has no class concept), not hidden. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full gradient-btn text-white shadow-lg"
              data-testid="button-new-booking"
            >
              <Plus className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem asChild data-testid="menu-item-create-appointment">
              <Link href="/booking/new">Create appointment</Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="cursor-default">
              Create personal event
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loadFailed ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center" data-testid="status-calendar-error">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-[15px] font-semibold">Couldn't load your calendar</p>
          <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
        </div>
      ) : stillDeterminingEmptiness ? (
        <div className="flex-1 flex items-center justify-center" data-testid="status-calendar-loading">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : hasNoBookingsAtAll ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <Empty className="border border-border rounded-xl bg-card" data-testid="empty-state-calendar">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarPlus />
              </EmptyMedia>
              <EmptyTitle>No appointments yet</EmptyTitle>
              <EmptyDescription>
                Your calendar is empty. Add your first appointment to start filling in your schedule.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/booking/new">
                <Button data-testid="button-add-first-appointment">
                  <CalendarPlus />
                  Add your first appointment
                </Button>
              </Link>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
      {/* ── Week strip ── */}
      <div className="px-3 pb-2 shrink-0">
        <div className="grid grid-cols-7">
          {weekDays.map(day => {
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            const hasBkgs = weekBookings.some(b => b.date === format(day, 'yyyy-MM-dd'));
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
          {/* Hour rows — `pointer-events-none` so these purely decorative
              lines never intercept a tap meant for the clickable 30-min
              cells rendered below (BUG-2). */}
          {hours.map(hour => (
            <div
              key={hour}
              className="absolute w-full flex items-start pointer-events-none"
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

          {/* ── Tappable 30-min cells (BUG-2) ── one per half-hour slot,
              sized/positioned to match the booking cards' own geometry
              (`left: 60px`, `right: 12px`) so the click target lines up with
              where a card would render. `z-0` (explicit, so it participates
              in the same stacking context as the booking cards below rather
              than relying on DOM order) keeps these strictly beneath the
              booking cards' `z-10` — a card always wins a tap over the empty
              cell underneath it. Rendered as `Link`s (real anchors), so
              they're keyboard-reachable by default with a real accessible
              name via `aria-label`.

              BUG-9: a cell whose slot has already passed — the whole viewed
              day is before today, or (on today's column specifically) the
              slot's own time has already gone by — renders as an inert,
              non-interactive `div` instead: no `Link`, no hover/active/focus
              treatment, reduced opacity, default cursor, and no
              `aria-label`/`data-testid` claiming it's an actionable
              create-link. This only touches these empty-slot cells — actual
              booking cards (rendered separately below) stay visible and
              tappable on past days so history remains readable. */}
          {Array.from({ length: GRID_HOURS * 2 }, (_, i) => i).map(i => {
            const minsFromGridStart = i * 30;
            const hour = GRID_START_HOUR + Math.floor(minsFromGridStart / 60);
            const minute = minsFromGridStart % 60;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const label = format(new Date(2000, 0, 1, hour, minute), 'h:mm a');
            const cellMinutesOfDay = hour * 60 + minute;
            const isPastCell =
              selectedDayIsPast || (isToday(selectedDate) && cellMinutesOfDay < nowMinutes);

            if (isPastCell) {
              return (
                <div
                  key={`cell-${i}`}
                  aria-hidden="true"
                  className="absolute z-0 block rounded-sm opacity-40 cursor-default"
                  style={{ top: `${i * (HOUR_HEIGHT / 2)}px`, height: `${HOUR_HEIGHT / 2}px`, left: '60px', right: '12px' }}
                  data-testid={`calendar-cell-past-${selectedStr}-${timeStr}`}
                />
              );
            }

            return (
              <Link
                key={`cell-${i}`}
                href={`/booking/new?date=${selectedStr}&time=${timeStr}`}
                aria-label={`Create appointment at ${label}`}
                className="absolute z-0 block rounded-sm transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                style={{ top: `${i * (HOUR_HEIGHT / 2)}px`, height: `${HOUR_HEIGHT / 2}px`, left: '60px', right: '12px' }}
                data-testid={`calendar-cell-${selectedStr}-${timeStr}`}
              />
            );
          })}

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

            // See `CALENDAR_UNSCORED_GAUGE`'s comment — every booking shows
            // Unknown on the calendar for Phase 1, deliberately.
            const gauge = CALENDAR_UNSCORED_GAUGE;

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
        </>
      )}
    </div>
  );
}
