import { useState, useRef, useEffect } from 'react';
import {
  format, addDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay,
  isToday, isSameDay, isSameMonth, isBefore,
} from 'date-fns';
import { adaptBooking } from '@/lib/api-adapters';
import { useListBookings, useListClients, useListEmployees, useListPackages, getListBookingsQueryKey } from '@workspace/api-client-react';
import { Link, useLocation, useSearch } from 'wouter';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Check, CalendarPlus, Loader2, AlertTriangle } from 'lucide-react';
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

// Material Design's calendar surfaces (Google Calendar chief among them) are
// the layout baseline for the new view switcher and week/month grids added
// here: a labeled dropdown trigger showing the active view, week view as
// day-columns sharing one hour axis, month view as a dense day-cell grid
// with overflow-truncated event chips. The visual language stays this app's
// own (Blue Glass, Signal Blue accent, existing `DropdownMenu` primitive) —
// only the structural/interaction conventions come from Material.
type CalendarViewMode = 'day' | 'week' | 'month';
const VIEW_LABELS: Record<CalendarViewMode, string> = { day: 'Day', week: 'Week', month: 'Month' };
const VIEW_MODES: CalendarViewMode[] = ['day', 'week', 'month'];

// Material's month grid shows a couple of event chips per day cell before
// collapsing into a "+N more" affordance — never the full list, which
// would blow out cell height. 2 keeps a same-day double-booking fully
// visible without crowding a narrow mobile cell.
const MONTH_CELL_MAX_EVENTS = 2;

// booking-new.tsx redirects here as `/calendar?date=YYYY-MM-DD&highlight=<id>`
// after a save — this is where that lands. `date` seeds the initial
// selected/week/month anchor (read once, at mount, the same lazy-init-from-
// URL pattern booking-new.tsx's own date/time state already uses) so the
// calendar opens already showing the right day instead of flashing "today"
// first.
function parseDateParam(search: string): Date | null {
  const dateParam = new URLSearchParams(search).get('date');
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseHighlightParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('highlight');
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

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
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(() => parseDateParam(search) ?? new Date());
  const [weekAnchor, setWeekAnchor] = useState(() => parseDateParam(search) ?? new Date());
  const [monthAnchor, setMonthAnchor] = useState(() => parseDateParam(search) ?? new Date());
  // The one-time arrival emphasis for a just-saved booking — see
  // `parseHighlightParam`'s call site below for the full lifecycle.
  const [highlightBookingId, setHighlightBookingId] = useState(() => parseHighlightParam(search));
  const highlightHandledRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Strip `?date=`/`?highlight=` from the URL immediately (not waiting on
  // data) so a refresh or a later `/calendar` visit never replays the
  // arrival sequence or re-pins the view to a stale date. Scoped to just
  // these two params (not "any query string") so a future, unrelated
  // `?foo=bar` on this route isn't silently swallowed by this effect.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.has('date') || params.has('highlight')) {
      setLocation('/calendar', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to current time on mount — day/week views only, month view
  // has no vertical time axis to scroll.
  useEffect(() => {
    if (viewMode !== 'month' && scrollRef.current) {
      const now = new Date();
      const minutesFromStart = (now.getHours() - GRID_START_HOUR) * 60 + now.getMinutes();
      const scrollTo = (minutesFromStart / 60) * HOUR_HEIGHT - 120;
      scrollRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, [viewMode]);

  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  const monthGridStart = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 0 });
  const monthGridEnd = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 0 });
  const monthGridDays = (() => {
    const out: Date[] = [];
    let d = monthGridStart;
    while (d <= monthGridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  })();
  const monthGridWeeks = Array.from({ length: monthGridDays.length / 7 }, (_, i) => monthGridDays.slice(i * 7, i * 7 + 7));

  const selectedStr = format(selectedDate, 'yyyy-MM-dd');

  // ── Real data ──────────────────────────────────────────────────────────────
  // Scoped to the visible week — FR-10's whole reason for a `start`/`end` list
  // query is so the calendar doesn't fetch every booking an organization has
  // ever made just to render one week. Kept unconditional (not gated to
  // `viewMode === 'day' || 'week'`) so switching modes never triggers a fresh
  // loading state for data already in hand.
  const weekBookingsQuery = useListBookings({
    start: format(weekStart, 'yyyy-MM-dd'),
    end: format(weekEnd, 'yyyy-MM-dd'),
  });
  // Month view's own range query — the grid shows the leading/trailing days
  // of adjacent months too, so it's scoped to the full 6-row grid, not just
  // the calendar month. Only enabled in month mode: no reason to pay for a
  // much wider query on every load when day/week are what most sessions use.
  const monthRangeParams = { start: format(monthGridStart, 'yyyy-MM-dd'), end: format(monthGridEnd, 'yyyy-MM-dd') };
  const monthBookingsQuery = useListBookings(
    monthRangeParams,
    { query: { queryKey: getListBookingsQueryKey(monthRangeParams), enabled: viewMode === 'month' } },
  );
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
  const monthBookings = (monthBookingsQuery.data ?? []).map(adaptBooking);

  const dayBookings = weekBookings
    .filter(b => b.date === selectedStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Once the just-created booking actually shows up in `dayBookings` (the
  // fetch that finds it may still be in flight on first render), scroll
  // straight to its own time instead of "now" and start the countdown that
  // ends the one-shot arrival emphasis — see `booking-card-arrive` below.
  // Guarded by a ref, not a dependency array, so it fires exactly once even
  // though `dayBookings` gets a new array identity on every render.
  useEffect(() => {
    if (highlightHandledRef.current || highlightBookingId === null) return;
    if (viewMode !== 'day' || weekBookingsQuery.isLoading) return;
    const target = dayBookings.find(b => b.id === highlightBookingId);
    if (!target) {
      // Data loaded and the booking still isn't here — e.g. it was deleted
      // seconds after creation. Give up gracefully rather than waiting
      // forever for a card that will never render.
      highlightHandledRef.current = true;
      setHighlightBookingId(null);
      return;
    }
    highlightHandledRef.current = true;
    if (scrollRef.current) {
      const [h, m] = target.startTime.split(':').map(Number);
      const minutesFromStart = (h - GRID_START_HOUR) * 60 + m;
      const scrollTo = (minutesFromStart / 60) * HOUR_HEIGHT - 160;
      scrollRef.current.scrollTop = Math.max(0, scrollTo);
    }
    // Matches the animation's own duration (see index.css) plus a buffer,
    // so the highlight class never gets pulled mid-animation.
    const timer = setTimeout(() => setHighlightBookingId(null), 1200);
    return () => clearTimeout(timer);
  });

  const hours = Array.from({ length: GRID_HOURS }, (_, i) => GRID_START_HOUR + i);

  // Current time position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = GRID_START_HOUR * 60;
  const nowTopPx = ((nowMinutes - startMinutes) / 60) * HOUR_HEIGHT;

  // BUG-9: a day before today has every empty-slot cell inert regardless of
  // time of day. Computed per-date (not just for `selectedDate`) since week
  // view needs this per column now, not just for the single viewed day.
  function isPastDay(day: Date): boolean {
    return isBefore(startOfDay(day), startOfDay(now));
  }
  const selectedDayIsPast = isPastDay(selectedDate);

  function prevWeek() { setWeekAnchor(subWeeks(weekAnchor, 1)); }
  function nextWeek() { setWeekAnchor(addWeeks(weekAnchor, 1)); }
  function prevMonth() { setMonthAnchor(subMonths(monthAnchor, 1)); }
  function nextMonth() { setMonthAnchor(addMonths(monthAnchor, 1)); }

  // Header prev/next paging depends on the active view: day/week both page
  // by week (day mode's own arrows have always paged the visible week strip
  // without moving the selected day inside it — unchanged), month pages by
  // calendar month.
  function handlePrev() { if (viewMode === 'month') prevMonth(); else prevWeek(); }
  function handleNext() { if (viewMode === 'month') nextMonth(); else nextWeek(); }

  function goToday() {
    const today = new Date();
    setSelectedDate(today);
    setWeekAnchor(today);
    setMonthAnchor(today);
  }

  // Jump into Day view for a specific date — used by week view's column
  // headers and month view's day cells (Material's own drill-down
  // convention: picking a day in a wider view opens that day).
  function goToDay(day: Date) {
    setSelectedDate(day);
    setWeekAnchor(day);
    setMonthAnchor(day);
    setViewMode('day');
  }

  const headerLabel = viewMode === 'month'
    ? format(monthAnchor, 'MMMM yyyy')
    : viewMode === 'week' && !isSameMonth(weekStart, weekEnd)
      ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
      : format(viewMode === 'week' ? weekStart : selectedDate, 'MMMM yyyy');

  const loadFailed = weekBookingsQuery.isError || clientsQuery.isError || packagesQuery.isError || employeesQuery.isError
    || (viewMode === 'month' && monthBookingsQuery.isError);

  return (
    <div className="min-h-[100dvh] pb-20 md:pb-6 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handlePrev}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="text-[17px] font-semibold tracking-tight hover:text-primary transition-colors truncate">
            {headerLabel}
          </button>
          <button
            onClick={handleNext}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View switcher — Material's own convention for Day/Week/Month
              (Google Calendar's top-right view dropdown), built on this
              app's existing `DropdownMenu` primitive rather than a new
              visual system. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-9 px-3 flex items-center gap-1 rounded-full border border-white/10 text-[13px] font-semibold text-foreground hover:bg-white/10 transition-colors"
                data-testid="button-view-switcher"
              >
                {VIEW_LABELS[viewMode]}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              {VIEW_MODES.map(mode => (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="flex items-center justify-between gap-2"
                  data-testid={`menu-item-view-${mode}`}
                >
                  <span>{VIEW_LABELS[mode]}</span>
                  {viewMode === mode && <Check className="w-4 h-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
      ) : viewMode === 'month' ? (
        <>
          {/* ── Month grid (Material's month-view layout: a dense day-cell
              grid, no time axis) ── */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="grid grid-cols-7 pb-1 shrink-0">
              {weekDays.map(day => (
                <div key={day.toISOString()} className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-1">
                  {format(day, 'EEEEE')}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/8 rounded-lg overflow-hidden border border-white/8">
              {monthGridWeeks.map(weekRow => weekRow.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const inCurrentMonth = isSameMonth(day, monthAnchor);
                const dayIsToday = isToday(day);
                const dayIsSelected = isSameDay(day, selectedDate);
                const bookingsForDay = monthBookings
                  .filter(b => b.date === dayStr)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                const overflow = bookingsForDay.length - MONTH_CELL_MAX_EVENTS;

                return (
                  <button
                    key={dayStr}
                    onClick={() => goToDay(day)}
                    className={`min-h-[84px] p-1.5 flex flex-col items-start gap-0.5 text-left bg-background transition-colors hover:bg-white/[0.05] ${
                      inCurrentMonth ? '' : 'opacity-40'
                    }`}
                    data-testid={`calendar-month-cell-${dayStr}`}
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-semibold shrink-0
                      ${dayIsSelected ? 'bg-primary text-white' : dayIsToday ? 'text-primary' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="w-full flex flex-col gap-0.5 min-w-0">
                      {bookingsForDay.slice(0, MONTH_CELL_MAX_EVENTS).map(b => {
                        const employee = employees.find(e => e.id === b.employeeIds[0]);
                        const client = clients.find(c => c.id === b.clientId);
                        return (
                          <div
                            key={b.id}
                            className="w-full text-[10px] leading-tight px-1 py-0.5 rounded truncate"
                            style={{ background: `${employee?.color ?? '#3654FF'}22`, color: employee?.color ?? undefined }}
                          >
                            {client?.name ?? 'Booking'}
                          </div>
                        );
                      })}
                      {overflow > 0 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{overflow} more</div>
                      )}
                    </div>
                  </button>
                );
              }))}
            </div>
          </div>
        </>
      ) : viewMode === 'week' ? (
        <>
          {/* ── Week column headers ── replaces the day-strip in week mode:
              each header doubles as the column's date label and a
              drill-down into Day view for that date (Material's own
              week-view convention). */}
          <div className="px-3 pb-2 shrink-0">
            <div className="flex" style={{ paddingLeft: '60px' }}>
              {weekDays.map(day => {
                const selected = isSameDay(day, selectedDate);
                const today = isToday(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => goToDay(day)}
                    className="flex-1 min-w-[64px] flex flex-col items-center gap-0.5 py-1"
                    data-testid={`calendar-week-header-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {format(day, 'EEEEE')}
                    </span>
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-semibold transition-colors
                      ${selected ? 'bg-primary text-white' : today ? 'text-primary' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-4 h-px bg-white/10 shrink-0" />

          {/* ── Scrollable week grid — one shared hour axis, 7 day columns.
              A single `overflow-auto` container handles both axes: the
              hour gutter is `sticky left-0` inside it, so vertical scroll
              moves gutter + columns together while horizontal scroll (only
              needed on narrow viewports, where 7 columns don't fit) slides
              columns under the pinned gutter. ── */}
          <div ref={scrollRef} className="flex-1 overflow-auto">
            <div className="relative flex" style={{ height: `${GRID_HOURS * HOUR_HEIGHT}px`, minWidth: `${60 + 7 * 72}px` }}>
              <div className="sticky left-0 z-20 bg-background w-[60px] shrink-0">
                {hours.map(hour => (
                  <div
                    key={hour}
                    className="absolute right-3 text-[11px] font-medium text-muted-foreground select-none"
                    style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT - 7}px` }}
                  >
                    {format(new Date(2000, 0, 1, hour, 0), 'h a')}
                  </div>
                ))}
              </div>

              {weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayIsPast = isPastDay(day);
                const dayIsToday = isToday(day);
                const bookingsForDay = weekBookings
                  .filter(b => b.date === dayStr)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));

                return (
                  <div key={dayStr} className="relative flex-1 min-w-[72px] border-l border-white/8">
                    {hours.map(hour => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-white/8 pointer-events-none"
                        style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT}px` }}
                      />
                    ))}
                    {hours.map(hour => (
                      <div
                        key={`half-${hour}`}
                        className="absolute w-full border-t border-white/[0.04] pointer-events-none"
                        style={{ top: `${(hour - GRID_START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                      />
                    ))}

                    {/* Tappable 30-min cells — same past-inert rule as day
                        view (BUG-9), evaluated per column. */}
                    {Array.from({ length: GRID_HOURS * 2 }, (_, i) => i).map(i => {
                      const minsFromGridStart = i * 30;
                      const hour = GRID_START_HOUR + Math.floor(minsFromGridStart / 60);
                      const minute = minsFromGridStart % 60;
                      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                      const label = format(new Date(2000, 0, 1, hour, minute), 'h:mm a');
                      const cellMinutesOfDay = hour * 60 + minute;
                      const isPastCell = dayIsPast || (dayIsToday && cellMinutesOfDay < nowMinutes);

                      if (isPastCell) {
                        return (
                          <div
                            key={`cell-${i}`}
                            aria-hidden="true"
                            className="absolute z-0 block rounded-sm opacity-40 cursor-default inset-x-1"
                            style={{ top: `${i * (HOUR_HEIGHT / 2)}px`, height: `${HOUR_HEIGHT / 2}px` }}
                            data-testid={`calendar-cell-past-${dayStr}-${timeStr}`}
                          />
                        );
                      }
                      return (
                        <Link
                          key={`cell-${i}`}
                          href={`/booking/new?date=${dayStr}&time=${timeStr}`}
                          aria-label={`Create appointment at ${label}`}
                          className="absolute z-0 block rounded-sm transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary inset-x-1"
                          style={{ top: `${i * (HOUR_HEIGHT / 2)}px`, height: `${HOUR_HEIGHT / 2}px` }}
                          data-testid={`calendar-cell-${dayStr}-${timeStr}`}
                        />
                      );
                    })}

                    {dayIsToday && nowTopPx >= 0 && nowTopPx <= GRID_HOURS * HOUR_HEIGHT && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${nowTopPx}px` }}>
                        <div className="h-[1.5px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
                      </div>
                    )}

                    {bookingsForDay.map(booking => {
                      const [h, m] = booking.startTime.split(':').map(Number);
                      const topPx = ((h * 60 + m - startMinutes) / 60) * HOUR_HEIGHT;
                      const employee = employees.find(e => e.id === booking.employeeIds[0]);
                      const client = clients.find(c => c.id === booking.clientId);
                      const pkgs = booking.packageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
                      const totalDuration = pkgs.reduce((sum, p) => sum + p.durationMinutes, 0) || 90;
                      const heightPx = Math.max((totalDuration / 60) * HOUR_HEIGHT, 32);

                      return (
                        <Link key={booking.id} href={`/booking/${booking.id}`}>
                          <div
                            className="absolute z-10 rounded-lg overflow-hidden cursor-pointer hover:brightness-110 transition-all px-1 pt-1 inset-x-1"
                            style={{
                              top: `${topPx + 2}px`,
                              height: `${heightPx - 4}px`,
                              background: `${employee?.color ?? '#3654FF'}22`,
                              borderLeft: `2px solid ${employee?.color ?? '#3654FF'}`,
                              backdropFilter: 'blur(8px)',
                            }}
                            data-testid={`booking-${booking.id}`}
                          >
                            <p className="text-[10px] font-semibold leading-tight truncate" style={{ color: employee?.color }}>
                              {client?.name}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
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

            // The one-shot arrival emphasis for the booking booking-new.tsx
            // just redirected here to show off — see `booking-card-arrive`
            // in index.css and the scroll/timeout effect above that owns
            // its lifecycle.
            const justCreated = booking.id === highlightBookingId;

            return (
              <Link key={booking.id} href={`/booking/${booking.id}`}>
                <div
                  className={`absolute z-10 rounded-xl overflow-hidden cursor-pointer hover:brightness-110 transition-all ${justCreated ? 'booking-card-arrive' : ''}`}
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
