import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListClients, useListPackages, useListEmployees, useListBookings,
  useCreateBooking, useCreateClient, useCreatePackage,
  useGetSettings, useComputeRoute, useListBookingAnchors, useComputeRouteMatrix,
  getListBookingsQueryKey, getListClientsQueryKey, getListPackagesQueryKey, getListBookingAnchorsQueryKey,
  type CreateBookingRequestStatus, type CreatePackageRequestCategory, type BookingResult,
} from '@workspace/api-client-react';
import { evenSplit } from '@/lib/api-adapters';
import { getSetupProfile } from '@/lib/setup-store';
import {
  suggestSlots,
  type SuggestedSlot,
  type FetchRouteMatrix,
  type SuggestSlotsSettingsInput,
} from '@/lib/suggest-slots';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { Skeleton } from '@workspace/blue-glass-design-system/components/ui/skeleton';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Badge } from '@workspace/blue-glass-design-system/components/ui/badge';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import {
  X, Check, ChevronDown, ArrowLeft, UserPlus, Plus,
  Fuel, Search, Clock, DollarSign, Calendar, Users, FileText, Loader2, RotateCw,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/blue-glass-design-system/components/ui/select';
import {
  computeFuelGauge,
  type FuelGaugeResult,
  type FuelGaugeBookingInput,
  type FuelGaugeSettingsInput,
  type FetchRoute,
} from '@/lib/fuel-gauge';
import { AddressAutocomplete, type AddressAutocompleteSelection } from '@/components/address-autocomplete';
import { format, parse } from 'date-fns';

// ─── Bottom sheet wrapper ────────────────────────────────────────────────────
// Still used for the date/time picker (explicitly out of scope for the page-
// takeover rework — see PRD_DetailHub_Appointment_Creation_Flow_Enhancement.md
// Section 8). The customer and service pickers moved to `PageTakeover` below.
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Full-screen page takeover ────────────────────────────────────────────────
// Fully opaque, top-anchored, occupies the full viewport — the pattern the
// signup wizard (`components/setup-wizard.tsx`) already established for
// multi-step full-screen flows (`fixed inset-0 z-[100] bg-background
// overflow-y-auto` + a sticky header with a back/close button and centered
// title). Reused here per FR-1 instead of inventing a new overlay style, for
// the customer and service pickers specifically — the date picker stays a
// `BottomSheet` (Section 8, explicitly out of scope).
//
// Header back/close buttons are sized 44px (`w-11 h-11`) rather than matching
// this file's existing 36px (`w-9 h-9`) chrome buttons elsewhere — these are
// brand-new surfaces with no prior touch-target pass (FR-20), so they get the
// standard comfortable minimum outright rather than inheriting a smaller size
// tuned for a denser, previously-existing header.
function PageTakeover({
  onBack,
  showBack,
  title,
  children,
  testId,
}: {
  onBack: () => void;
  showBack: boolean;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    // `z-[100]` (matching `components/setup-wizard.tsx`'s own full-screen
    // takeover precedent) rather than `z-50` — `bottom-nav.tsx`'s fixed mobile
    // tab bar is also `z-50` and renders after `<Router />` in `App.tsx`'s DOM
    // order, so at equal z-index it would sit on top of this takeover's
    // bottom edge instead of being fully covered by it.
    <div className="fixed inset-0 z-[100] bg-background overflow-y-auto" data-testid={testId}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition-colors shrink-0"
        >
          {showBack ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
        <p className="flex-1 text-center text-[16px] font-semibold">{title}</p>
        <div className="w-11 shrink-0" aria-hidden />
      </div>
      {children}
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────
// `py-6`/`mb-4` (bumped up from `py-4`/`mb-3`) per FR-19 — with four sections
// gone (All-day, Repeats, Team, Deposit & extras) the remaining sections get
// more room to breathe rather than keeping spacing tuned for a longer form.
function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="px-5 py-6 border-b border-border/40">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <p className="text-[15px] font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────────────
function PillBtn({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: React.ElementType }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-muted hover:bg-muted/70 transition-colors text-[15px] font-medium min-h-[52px]"
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}

// ─── Time slots grid ─────────────────────────────────────────────────────────
const TIMES = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
               '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
               '16:00','16:30','17:00','17:30','18:00'];

function fmtTime(t: string) {
  try {
    return format(parse(t, 'HH:mm', new Date()), 'h:mm a');
  } catch { return t; }
}

// ─── Fuel Gauge readout ────────────────────────────────────────────────────
// Rebuilt per PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md §8.1/§8.2 — money
// first, gauge second, fuel and drive-time cost lines always both present
// and never collapsed (FR-23a). Only ever renders once an address has been
// *selected* from suggestions (FR-2/FR-14); computation state (`GaugeUiState`)
// is owned by the parent component, not derived here.
const GRADE_COLOR: Record<string, string> = {
  strong: '#1E9E62', fair: '#D9A404', weak: '#DC2626', unknown: '#9ca3af',
};
const GRADE_NEEDLE: Record<string, [number, number]> = {
  strong: [20, 8], fair: [12, 4], weak: [4, 8], unknown: [12, 4],
};
const GRADE_ARC: Record<string, string | null> = {
  strong: 'M2,14 A10,10 0 0 1 22,14',
  fair: 'M2,14 A10,10 0 0 1 12,4',
  weak: 'M2,14 A10,10 0 0 1 7,5.34',
  unknown: null,
};

function GaugeSVGSmall({ grade }: { grade: string }) {
  const color = GRADE_COLOR[grade] ?? '#9ca3af';
  const [nx, ny] = GRADE_NEEDLE[grade] ?? [12, 4];
  const arc = GRADE_ARC[grade];
  return (
    <svg width="28" height="16" viewBox="0 0 24 14" aria-hidden>
      <path d="M2,14 A10,10 0 0 1 22,14" fill="none" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round" />
      {arc && <path d={arc} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />}
      {grade !== 'unknown' && (
        <line x1="12" y1="14" x2={nx} y2={ny} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      )}
      <circle cx="12" cy="14" r="2" fill={color} />
      {grade === 'unknown' && (
        <text x="12" y="10" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="bold">?</text>
      )}
    </svg>
  );
}

function gradeSentence(grade: FuelGaugeResult['grade']): string {
  return grade === 'strong' ? 'Worth the trip'
       : grade === 'fair'   ? 'Okay — watch the drive'
       : grade === 'weak'   ? 'The drive eats this one'
       : 'Can’t score this yet';
}

function anchorOriginLabel(type: FuelGaugeResult['anchorType']): string {
  return type === 'home'     ? 'from Home Base'
       : type === 'adjacent' ? 'from previous/next job'
       : 'from nearest job';
}

// ─── Appointment Optimizer — recommendation card copy (FR-6/FR-7/FR-8) ────────
// The reason line is the product (§7.2): it must read as something a
// dispatcher would say out loud, name the anchor job, never mention money,
// and never say "you keep" (that phrase is reserved for the Fuel Gauge
// above). Both patterns below are lifted verbatim from the PRD's own
// examples — "Fits between his 12:30 and 4:00 jobs" for a double-anchored
// slot, "8 min from Maria's 9:00 AM job" for a single-anchored one — rather
// than inventing a third neighborhood-name style ("already in Bay Ridge
// that morning") that would require guessing at a neighborhood from a
// formatted address string with no real data backing the guess.
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function recommendationReason(slot: SuggestedSlot, employeeName: string): string {
  const who = possessive(firstName(employeeName));
  if (slot.doubleAnchored && slot.otherBookingStartTime) {
    const [earlier, later] = slot.position === 'before'
      ? [slot.otherBookingStartTime, slot.anchorStartTime]
      : [slot.anchorStartTime, slot.otherBookingStartTime];
    return `Fits between ${who} ${fmtTime(earlier)} and ${fmtTime(later)} jobs`;
  }
  return `${slot.driveToAnchorMinutes} min from ${who} ${fmtTime(slot.anchorStartTime)} job`;
}

// Supporting detail (§7.2) — plain words, small type, money confined here
// and only "gas" (fuel alone, never fuel+labor summed — FR-23a-style
// separation reused from Fuel Gauge) and omitted entirely below $0.50 so a
// double-anchored slot with a trivial detour can stand on its logistics
// reason alone, per FR-7.
function recommendationDetail(slot: SuggestedSlot): string | null {
  const parts: string[] = [];
  parts.push(slot.doubleAnchored ? `${slot.addedDriveMinutes} min detour` : `${slot.addedDriveMinutes} min added drive`);
  if (slot.addedFuelCostDollars >= 0.5) {
    parts.push(`adds $${slot.addedFuelCostDollars.toFixed(2)} of gas`);
  }
  return parts.join(' · ');
}

type GaugeUiState = 'no-address' | 'no-service' | 'no-hq' | 'calculating' | 'scored' | 'error';

function FuelGaugeRow({
  uiState, result, onRetry,
}: {
  uiState: GaugeUiState;
  result: FuelGaugeResult | null;
  onRetry: () => void;
}) {
  if (uiState === 'no-address') {
    return (
      <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1.5" data-testid="fuel-gauge-state-no-address">
        <Fuel className="w-3 h-3" />
        Pick an address to see if it's worth the trip
      </p>
    );
  }

  if (uiState === 'no-service') {
    return (
      <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1.5" data-testid="fuel-gauge-state-no-service">
        <Fuel className="w-3 h-3" />
        Add a service to see what you keep
      </p>
    );
  }

  if (uiState === 'no-hq') {
    return (
      <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1.5" data-testid="fuel-gauge-state-no-hq">
        <Fuel className="w-3 h-3" />
        Set your shop address in{' '}
        <Link href="/more/settings" className="text-primary underline underline-offset-2">Settings</Link>
        {' '}to score jobs
      </p>
    );
  }

  if (uiState === 'calculating') {
    return (
      <div className="mt-3 px-4 py-3 rounded-2xl border border-border/60 space-y-2.5" data-testid="fuel-gauge-state-calculating">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
      </div>
    );
  }

  if (uiState === 'error' || !result) {
    return (
      <div
        className="mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border"
        style={{ borderColor: `${GRADE_COLOR.unknown}55`, background: `${GRADE_COLOR.unknown}0D` }}
        data-testid="fuel-gauge-state-error"
      >
        <p className="text-[13px] font-medium text-muted-foreground">Couldn't get drive time</p>
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-primary shrink-0"
          data-testid="button-fuel-gauge-retry"
        >
          <RotateCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  // uiState === 'scored'
  if (result.grade === 'unknown') {
    // A service is priced at $0, or some other structural edge case that
    // isn't a routing failure (§10) — no Retry, just a quiet explanation.
    const copy = result.reason === 'no-price'
      ? 'Free or $0 service — not scored'
      : 'Can’t score this yet';
    return (
      <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1.5" data-testid="fuel-gauge-state-unknown">
        <Fuel className="w-3 h-3" />
        {copy}
      </p>
    );
  }

  const color = GRADE_COLOR[result.grade];

  return (
    <div
      className="mt-3 px-4 py-3 rounded-2xl border"
      style={{ borderColor: `${color}55`, background: `${color}0D` }}
      data-testid="fuel-gauge-state-scored"
    >
      {/* Money-first headline */}
      <div className="flex items-center gap-3">
        <GaugeSVGSmall grade={result.grade} />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold tabular-nums" style={{ color }}>
            You keep ${result.youKeep.toFixed(0)} of ${result.servicePrice.toFixed(0)}
          </p>
          <p className="text-[13px] font-medium" style={{ color }}>{gradeSentence(result.grade)}</p>
        </div>
      </div>

      {/* Drive time, origin named */}
      <p className="text-[13px] text-muted-foreground mt-2.5">
        Drive Time: est. {Math.round(result.roundTripMinutes / 2)} min
        <br />
        {anchorOriginLabel(result.anchorType)}
      </p>

      {/* Fuel and drive-time cost lines — always both, never collapsed (FR-23a) */}
      <div className="mt-2.5 space-y-1 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Fuel</span>
          <span className="font-medium tabular-nums">${result.fuelCost.toFixed(2)} · {result.roundTripMiles.toFixed(1)} mi round trip</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Drive time</span>
          <span className="font-medium tabular-nums">${result.driveCost.toFixed(2)} · {Math.round(result.roundTripMinutes)} min round trip</span>
        </div>
      </div>
    </div>
  );
}

// ─── Quick-add customer form state ────────────────────────────────────────────
// Per FR-3: quick-add is First name / Last name / phone only — email and
// address are dropped from the UI (a real reduction from the old
// `newClientValid`, which required a regex-valid email and a non-empty
// address before "Save customer" enabled).
interface NewClientState { firstName: string; lastName: string; phone: string }
const EMPTY_NEW_CLIENT: NewClientState = { firstName: '', lastName: '', phone: '' };

// ─── Quick-add package form state ─────────────────────────────────────────────
// Grounded in the real `packages` schema (`lib/db/src/schema/packages.ts` +
// `CreatePackageBody` in `lib/api-zod/src/generated/api.ts`) — five `NOT NULL`
// fields beyond name are required: category, description, price,
// durationMinutes, isAddon. `durationMinutes` is read directly in this file
// for total-duration display, the Fuel Gauge calc, and `suggestSlots`, so it's
// a required field here, not an optional nicety (FR-6).
interface NewPackageState {
  name: string;
  price: string;
  durationMinutes: string;
  category: CreatePackageRequestCategory;
  description: string;
}
const EMPTY_NEW_PACKAGE: NewPackageState = {
  name: '', price: '', durationMinutes: '', category: 'Full', description: '',
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingNew() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const setup = getSetupProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Real data ──────────────────────────────────────────────────────────────
  const clientsQuery = useListClients();
  const packagesQuery = useListPackages();
  const employeesQuery = useListEmployees();
  // Unscoped (deliberately not passing `clientId` here) — the fuel-gauge/
  // suggested-slots engines below need visibility into every booking on whatever
  // date the user ultimately picks, across all clients, not just a fixed nearby
  // window for one client — same known scaling caveat as `clients.tsx`.
  const bookingsQuery = useListBookings();
  // Real settings — PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-24/§9.4.
  // Kept separate from the mock `settings` import above (still used by
  // `suggestSlots`, out of this PRD's scope) since it's the source for HQ
  // coordinates, gas price, MPG and technician hourly cost the real Fuel
  // Gauge needs.
  const settingsQuery = useGetSettings();

  const clients = clientsQuery.data ?? [];
  const packages = packagesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  // Raw (un-adapted) bookings — `FuelGaugeBookingInput` needs `googlePlaceId`/
  // `formattedAddress`, which `adaptBooking`'s mock-shaped `Booking` doesn't
  // carry. `BookingResult` is already a structural match, so no adapter is
  // needed here.
  const rawBookings: FuelGaugeBookingInput[] = bookingsQuery.data ?? [];
  // Same underlying data as `rawBookings`, typed as the full `BookingResult`
  // (not narrowed to `FuelGaugeBookingInput`'s field set) — the Appointment
  // Optimizer's schedule-gap check needs `packageIds` too, to size each
  // peer booking's duration.
  const bookingsForOptimizer: BookingResult[] = bookingsQuery.data ?? [];
  const realSettings = settingsQuery.data;

  // Deliberately excludes `settingsQuery` — an org with no settings row yet
  // (404, e.g. a legacy account that predates auto-created defaults) must
  // still be able to create a booking. Every `realSettings` read below is
  // already null-safe and degrades to the Fuel Gauge's "No HQ set" state
  // (FR-24/§8.2) rather than blocking the whole screen on a piece of data
  // only the gauge itself needs.
  const referenceDataLoading = clientsQuery.isLoading || packagesQuery.isLoading || employeesQuery.isLoading || bookingsQuery.isLoading;
  const referenceDataFailed = clientsQuery.isError || packagesQuery.isError || employeesQuery.isError || bookingsQuery.isError;

  // Form state
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [newClient, setNewClient] = useState<NewClientState>(EMPTY_NEW_CLIENT);
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [newPackage, setNewPackage] = useState<NewPackageState>(EMPTY_NEW_PACKAGE);
  const [creatingPackage, setCreatingPackage] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  const [address, setAddress] = useState('');
  // Non-null only immediately after a suggestion is selected from
  // `AddressAutocomplete` (FR-14) — any further typing in the field clears
  // it (see the Location section's `onTextChange` below), since free-typed
  // text no longer matches these coordinates. `canSave` never depends on
  // this — a manually-typed, never-selected address still saves fine (FR-17
  // edge case), it just never geocodes and the gauge stays in its
  // "no address selected" placeholder forever for that booking.
  const [addressSelection, setAddressSelection] = useState<AddressAutocompleteSelection | null>(null);
  // Kept exactly as-is per FR-12: the explicit "Team" picker UI is gone, but
  // Smart Suggestions (`applySuggestion`) and the Fuel Gauge below both
  // still quietly depend on this state and keep working unchanged.
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [notes, setNotes] = useState('');

  // Page takeovers / sheets
  const [showCustomers, setShowCustomers] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Landing here from the clients page's "Add your first client" empty-state
  // CTA (`?newClient=1`) — this page doubles as the only place a client can be
  // created, so jump straight into the "new customer" step of the customer
  // takeover instead of making the visitor rediscover it.
  useEffect(() => {
    if (new URLSearchParams(search).get('newClient') === '1') {
      setShowCustomers(true);
      setCreatingClient(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // Suggested slots
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null); // key = date|time|empId

  const applySuggestion = (slot: SuggestedSlot) => {
    const key = `${slot.date}|${slot.startTime}|${slot.employeeId}`;
    setDate(slot.date);
    setTime(slot.startTime);
    setSelectedEmployees([slot.employeeId]);
    setSelectedSuggestion(key);
  };

  // FR-11: `selectedEmployees.length > 0` dropped — the API spec states
  // `employeeSplit` may be empty (a booking can be created before an employee
  // is assigned), so the frontend no longer hard-requires it either.
  const canSave = selectedClient !== null && selectedPackages.length > 0 && address.trim().length > 0;

  const selectedClientObj = clients.find(c => c.id === selectedClient);
  const selectedPkgs = packages.filter(p => selectedPackages.includes(p.id));
  const totalPrice = selectedPkgs.reduce((s, p) => s + p.price, 0);
  const totalDuration = selectedPkgs.reduce((s, p) => s + p.durationMinutes, 0);

  const isMobile = !setup.isStorefront;

  // ── Fuel Gauge — real computation, gated on selection (FR-2/FR-14) ────────
  // `useComputeRoute()`'s hook must live at the component level (React Query
  // hooks can't be called inside `computeFuelGauge` itself); this wraps
  // `mutateAsync` into the plain-async `fetchRoute` callback `fuel-gauge.ts`
  // expects, per its dependency-injection design.
  const computeRouteMutation = useComputeRoute();
  const fetchRoute = useCallback<FetchRoute>(async (originPlaceId, destinationPlaceId, departureTimeIso) => {
    const result = await computeRouteMutation.mutateAsync({
      data: { originPlaceId, destinationPlaceId, departureTime: departureTimeIso },
    });
    return { miles: result.miles, minutes: result.minutes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeRouteMutation.mutateAsync]);

  const [gaugeUiState, setGaugeUiState] = useState<GaugeUiState>('no-address');
  const [gaugeResult, setGaugeResult] = useState<FuelGaugeResult | null>(null);
  const [gaugeRetryNonce, setGaugeRetryNonce] = useState(0);

  const hqHasCoordinates = !!(realSettings?.hqLatitude != null && realSettings?.hqLongitude != null && realSettings?.hqGooglePlaceId);

  // Recomputes only when a place is *selected* (never on keystroke — the
  // whole point of FR-2), and again when appointment time, technician, or
  // priced services change while a place is already selected (§9.3).
  useEffect(() => {
    if (!addressSelection) {
      setGaugeUiState('no-address');
      setGaugeResult(null);
      return;
    }
    if (selectedPackages.length === 0) {
      setGaugeUiState('no-service');
      setGaugeResult(null);
      return;
    }
    if (!realSettings || !hqHasCoordinates) {
      setGaugeUiState('no-hq');
      setGaugeResult(null);
      return;
    }

    let cancelled = false;
    setGaugeUiState('calculating');

    const targetInput: FuelGaugeBookingInput = {
      id: -1,
      date: date || format(new Date(), 'yyyy-MM-dd'),
      startTime: time || '09:00',
      status: 'pending',
      employeeIds: selectedEmployees,
      googlePlaceId: addressSelection.placeId,
      formattedAddress: addressSelection.formattedAddress,
    };
    const settingsInput: FuelGaugeSettingsInput = {
      homeAddress: realSettings.homeAddress,
      hqGooglePlaceId: realSettings.hqGooglePlaceId,
      gasPrice: realSettings.gasPrice,
      vehicleMpg: realSettings.vehicleMpg,
      techHourlyCost: realSettings.techHourlyCost,
    };

    computeFuelGauge(targetInput, totalPrice, rawBookings, settingsInput, fetchRoute).then((result) => {
      if (cancelled) return;
      setGaugeResult(result);
      setGaugeUiState(result.grade === 'unknown' && result.reason === 'routing-failed' ? 'error' : 'scored');
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addressSelection?.placeId, addressSelection?.latitude, addressSelection?.longitude,
    selectedPackages, totalPrice, date, time, selectedEmployees,
    realSettings, hqHasCoordinates, rawBookings, fetchRoute, gaugeRetryNonce,
  ]);

  const retryGauge = () => setGaugeRetryNonce(n => n + 1);

  // ── Appointment Optimizer — grouping recommendations (FR-1 through FR-3,
  //    FR-6 through FR-11, FR-15 through FR-18) ────────────────────────────
  // Second, independent DI-routing consumer alongside the Fuel Gauge above —
  // same pattern (a thin `mutateAsync` wrapper into the plain-async contract
  // `suggest-slots.ts` expects), different endpoint (batch matrix, FR-18a).
  // Gated on `addressSelection` (FR-10), never the raw typed `address`
  // string — `useListBookingAnchors` only fires once a place is selected.
  const anchorsParams = { lat: addressSelection?.latitude ?? 0, lng: addressSelection?.longitude ?? 0 };
  const anchorsQuery = useListBookingAnchors(
    anchorsParams,
    { query: { queryKey: getListBookingAnchorsQueryKey(anchorsParams), enabled: !!addressSelection } },
  );

  const computeRouteMatrixMutation = useComputeRouteMatrix();
  const fetchRouteMatrix = useCallback<FetchRouteMatrix>(async (originPlaceId, destinationPlaceIds, departureTimeIso) => {
    return computeRouteMatrixMutation.mutateAsync({
      data: { originPlaceId, destinationPlaceIds, departureTime: departureTimeIso },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeRouteMatrixMutation.mutateAsync]);

  // BUG-5 (`BUGS_Mobull_2026-09-10.md`) — 'skipped' is new: distinguishes
  // "genuinely nothing nearby" from "candidates existed but couldn't be
  // evaluated" (no coordinates, or no technician assigned yet — the
  // confirmed live cause; see `suggest-slots.ts`'s `SuggestSlotsOutcome`
  // doc comment). Without this, both collapsed into the same silent
  // "No nearby jobs" empty state the bug report describes.
  type RecoUiState = 'hidden' | 'searching' | 'empty' | 'skipped' | 'error' | 'ready';
  const [recoUiState, setRecoUiState] = useState<RecoUiState>('hidden');
  const [recommendations, setRecommendations] = useState<SuggestedSlot[]>([]);
  const [recoSkipped, setRecoSkipped] = useState({ noCoordinates: 0, noTechnician: 0 });
  const [recoRetryNonce, setRecoRetryNonce] = useState(0);

  useEffect(() => {
    if (!addressSelection) {
      setRecoUiState('hidden');
      setRecommendations([]);
      return;
    }

    // Anchors query failed outright (not a partial per-element failure —
    // those are handled inside `suggest-slots.ts` itself, per §10) — closest
    // FR-11 state is "Routing failed".
    if (anchorsQuery.isError) {
      setRecoUiState('error');
      return;
    }

    // Settings are required for the cost/added-drive math (FR-3/FR-17) —
    // there's no dedicated FR-11 state for "no settings row yet" (a rare,
    // legacy-org edge case; the Fuel Gauge above already surfaces its own
    // "no-hq" placeholder for the same org), so once the settings fetch has
    // genuinely settled with nothing, this collapses into the same
    // "Routing failed" + Retry state as any other reason the search can't
    // run — never a silent, permanently-spinning section.
    if (settingsQuery.isError) {
      setRecoUiState('error');
      return;
    }

    if (anchorsQuery.isLoading || !anchorsQuery.data || !realSettings) {
      setRecoUiState('searching');
      return;
    }

    const anchors = anchorsQuery.data;
    if (anchors.length === 0) {
      setRecoUiState('empty');
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    setRecoUiState('searching');

    const settingsInput: SuggestSlotsSettingsInput = {
      homeAddress: realSettings.homeAddress,
      hqGooglePlaceId: realSettings.hqGooglePlaceId,
      gasPrice: realSettings.gasPrice,
      vehicleMpg: realSettings.vehicleMpg,
      techHourlyCost: realSettings.techHourlyCost,
    };

    suggestSlots(
      { googlePlaceId: addressSelection.placeId, latitude: addressSelection.latitude, longitude: addressSelection.longitude },
      totalDuration,
      anchors,
      bookingsForOptimizer,
      packages,
      settingsInput,
      fetchRouteMatrix,
      fetchRoute,
    ).then((outcome) => {
      if (cancelled) return;
      setRecommendations(outcome.slots);
      setRecoSkipped({ noCoordinates: outcome.skippedNoCoordinates, noTechnician: outcome.skippedNoTechnician });
      if (outcome.slots.length > 0) {
        setRecoUiState('ready');
      } else if (outcome.skippedNoCoordinates > 0 || outcome.skippedNoTechnician > 0) {
        setRecoUiState('skipped');
      } else {
        setRecoUiState('empty');
      }
    }).catch(() => {
      if (cancelled) return;
      setRecoUiState('error');
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addressSelection?.placeId, addressSelection?.latitude, addressSelection?.longitude,
    anchorsQuery.data, anchorsQuery.isLoading, anchorsQuery.isError,
    settingsQuery.isError, realSettings, totalDuration, bookingsForOptimizer, packages,
    fetchRouteMatrix, fetchRoute, recoRetryNonce,
  ]);

  const retryRecommendations = () => {
    if (anchorsQuery.isError) anchorsQuery.refetch();
    if (settingsQuery.isError) settingsQuery.refetch();
    setRecoRetryNonce(n => n + 1);
  };

  // Formatted display values
  const dateLabel = (() => {
    try { return format(new Date(date + 'T00:00:00'), 'EEE, MMM d'); }
    catch { return date; }
  })();

  const createBookingMutation = useCreateBooking({
    mutation: {
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        toast({ title: 'Appointment booked' });
        setLocation(`/booking/${created.id}`);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong booking this appointment. Please try again.';
        toast({ title: 'Booking failed', description: message, variant: 'destructive' });
      },
    },
  });

  const handleSave = () => {
    if (!canSave || createBookingMutation.isPending) return;
    createBookingMutation.mutate({
      data: {
        clientId: selectedClient!,
        packageIds: selectedPackages,
        employeeSplit: evenSplit(selectedEmployees),
        date,
        startTime: time,
        address,
        // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-14/FR-17: only present
        // when the address was actually selected from suggestions — omitted
        // entirely (never sent as `null`) for a manually-typed address, so
        // the booking is stored with no coordinates and the Fuel Gauge
        // shows Unknown until it's edited with a selected suggestion.
        ...(addressSelection
          ? {
              latitude: addressSelection.latitude,
              longitude: addressSelection.longitude,
              googlePlaceId: addressSelection.placeId,
              formattedAddress: addressSelection.formattedAddress,
            }
          : {}),
        // FR-16: both remain `NOT NULL` columns on the real `bookings` table,
        // so they still need a value — just always zero now that the Deposit
        // & extras section (and the parking-cost field within it) is gone
        // from this screen (FR-14/FR-17).
        depositAmount: 0,
        parkingCost: 0,
        // FR-15: deposit-based status logic is gone — every new booking is
        // created as `'confirmed'`.
        status: 'confirmed' as CreateBookingRequestStatus,
        notes: notes.trim() ? notes.trim() : null,
      },
    });
  };

  const createClientMutation = useCreateClient({
    mutation: {
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setSelectedClient(created.id);
        setShowCustomers(false);
        setCreatingClient(false);
        setNewClient(EMPTY_NEW_CLIENT);
        setClientSearch('');
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong creating this client. Please try again.';
        toast({ title: 'Couldn’t create client', description: message, variant: 'destructive' });
      },
    },
  });

  const newClientValid =
    newClient.firstName.trim().length > 0 &&
    newClient.phone.trim().length > 0;

  const handleCreateClient = () => {
    if (!newClientValid || createClientMutation.isPending) return;
    const full = `${newClient.firstName} ${newClient.lastName}`.trim();
    createClientMutation.mutate({
      data: {
        name: full,
        phone: newClient.phone.trim(),
        // Email/address are optional on the real `clients` schema — a
        // quick-added client simply won't have either on file until someone
        // fills them in later from the Clients page (FR-4).
      },
    });
  };

  // Splits whatever was typed into the search field on the first space to
  // pre-fill First/Last name (FR-3) — "John Smith" -> First: John, Last: Smith
  // — rather than making the operator retype it.
  const startQuickAddClient = (typed: string) => {
    const trimmed = typed.trim();
    const spaceIdx = trimmed.indexOf(' ');
    const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const lastName = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    setNewClient({ firstName, lastName, phone: '' });
    setCreatingClient(true);
  };

  const createPackageMutation = useCreatePackage({
    mutation: {
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        setSelectedPackages(p => [...p, created.id]);
        setNewPackage(EMPTY_NEW_PACKAGE);
        setCreatingPackage(false);
        setServiceSearch('');
        toast({ title: 'Package created' });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong creating this package. Please try again.';
        toast({ title: 'Couldn’t create package', description: message, variant: 'destructive' });
      },
    },
  });

  const newPackageValid =
    newPackage.name.trim().length > 0 &&
    parseFloat(newPackage.price) >= 0 &&
    !Number.isNaN(parseFloat(newPackage.price)) &&
    parseInt(newPackage.durationMinutes, 10) >= 1 &&
    !Number.isNaN(parseInt(newPackage.durationMinutes, 10)) &&
    newPackage.description.trim().length > 0;

  const handleCreatePackage = () => {
    if (!newPackageValid || createPackageMutation.isPending) return;
    createPackageMutation.mutate({
      data: {
        name: newPackage.name.trim(),
        category: newPackage.category,
        description: newPackage.description.trim(),
        price: parseFloat(newPackage.price),
        durationMinutes: parseInt(newPackage.durationMinutes, 10),
        // Derived from category (FR-6) — 'Add-on' -> true, everything else -> false.
        isAddon: newPackage.category === 'Add-on',
      },
    });
  };

  const startQuickAddPackage = (typed: string) => {
    setNewPackage({ ...EMPTY_NEW_PACKAGE, name: typed.trim() });
    setCreatingPackage(true);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const filteredPackages = packages.filter(p =>
    p.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const pkgsByCategory = filteredPackages.reduce<Record<string, typeof packages>>((acc, pkg) => {
    if (!acc[pkg.category]) acc[pkg.category] = [];
    acc[pkg.category].push(pkg);
    return acc;
  }, {});

  if (referenceDataFailed) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-4 text-center bg-background" data-testid="status-booking-new-error">
        <p className="text-[15px] font-semibold">Couldn't load booking data</p>
        <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
      </div>
    );
  }

  if (referenceDataLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background" data-testid="status-booking-new-loading">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-48 md:pb-24 bg-background">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation('/calendar')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="flex-1 text-center text-[16px] font-semibold">Create appointment</p>
        <button
          onClick={handleSave}
          disabled={!canSave || createBookingMutation.isPending}
          className={`px-4 py-1.5 rounded-2xl text-[15px] font-semibold transition-all ${
            canSave && !createBookingMutation.isPending ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {createBookingMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Customer ── */}
      <Section title="Customer" icon={Users}>
        {selectedClientObj ? (
          <div
            className="flex items-center gap-3 p-3 rounded-2xl border border-primary bg-primary/5 cursor-pointer min-h-[52px]"
            onClick={() => setShowCustomers(true)}
          >
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-[13px]">
              {selectedClientObj.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium">{selectedClientObj.name}</p>
              <p className="text-[12px] text-muted-foreground">{selectedClientObj.phone}</p>
            </div>
            <Check className="w-4 h-4 text-primary shrink-0" />
          </div>
        ) : (
          <PillBtn label="Add customer" icon={UserPlus} onClick={() => setShowCustomers(true)} />
        )}
      </Section>

      {/* ── Services ── */}
      <Section title="Services and items" icon={DollarSign}>
        {selectedPkgs.length > 0 && (
          <div className="space-y-2 mb-3">
            {selectedPkgs.map(pkg => (
              <div key={pkg.id} className="flex items-center justify-between px-3 py-3 rounded-2xl bg-muted/50 min-h-[52px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium">{pkg.name}</p>
                  <p className="text-[12px] text-muted-foreground">{pkg.durationMinutes} min</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-semibold tabular-nums">${pkg.price}</p>
                  <button
                    onClick={() => setSelectedPackages(p => p.filter(id => id !== pkg.id))}
                    className="w-8 h-8 rounded-full bg-muted-foreground/20 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {/* Total */}
            <div className="flex justify-between px-3 pt-1">
              <p className="text-[13px] text-muted-foreground">{totalDuration} min total</p>
              <p className="text-[15px] font-bold tabular-nums">${totalPrice}</p>
            </div>
          </div>
        )}
        <PillBtn label="Add service" icon={Plus} onClick={() => setShowServices(true)} />
      </Section>

      {/* ── Location ── */}
      <Section title="Location" icon={Fuel}>
        <AddressAutocomplete
          value={address}
          onTextChange={(text) => { setAddress(text); setAddressSelection(null); }}
          onSelect={(place) => { setAddress(place.formattedAddress); setAddressSelection(place); }}
          originLat={realSettings?.hqLatitude ?? undefined}
          originLng={realSettings?.hqLongitude ?? undefined}
          placeholder="Client address or service location"
          data-testid="input-booking-address"
        />

        {/* Fuel Gauge — real readout, per §8.1/§8.2. Gated on `isMobile`
            (mobile-service businesses drive to the job; a storefront
            business doesn't), matching this section's prior behavior. */}
        {isMobile && (
          <FuelGaugeRow uiState={gaugeUiState} result={gaugeResult} onRetry={retryGauge} />
        )}
      </Section>

      {/* ── Recommended — groups with nearby work (FR-1/§7.1) ── */}
      {/* No address selected -> section hidden entirely, no empty shell (FR-11). */}
      {addressSelection && recoUiState !== 'hidden' && (
        <div className="px-5 pt-6 pb-4 border-b border-border/40 bg-muted/40" data-testid="section-recommendations">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Recommended — groups with nearby work
          </p>

          {recoUiState === 'searching' && (
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar" data-testid="status-recommendations-searching">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="w-64 shrink-0 rounded-xl border p-4 space-y-2.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {recoUiState === 'empty' && (
            <p className="text-sm text-muted-foreground" data-testid="text-recommendations-empty">
              No nearby jobs in the next 7 days — any time below works.
            </p>
          )}

          {/* BUG-5 — distinct from 'empty': real nearby jobs exist but
              couldn't be evaluated, either for missing coordinates (a
              legacy or free-typed address) or no technician assigned yet
              (the confirmed live cause). Surfacing this instead of the
              generic empty state is what prevents this exact failure from
              silently recurring undetected. */}
          {recoUiState === 'skipped' && (() => {
            const total = recoSkipped.noCoordinates + recoSkipped.noTechnician;
            const reasons: string[] = [];
            if (recoSkipped.noTechnician > 0) reasons.push('need a technician assigned');
            if (recoSkipped.noCoordinates > 0) reasons.push('need their address re-saved');
            return (
              <p className="text-sm text-muted-foreground" data-testid="text-recommendations-skipped">
                {total} nearby {total === 1 ? 'job' : 'jobs'} couldn't be checked — {reasons.join(' and ')}.
              </p>
            );
          })()}

          {recoUiState === 'error' && (
            <div className="flex items-center justify-between gap-3" data-testid="status-recommendations-error">
              <p className="text-sm text-muted-foreground">Couldn't check drive times</p>
              <Button variant="ghost" size="sm" onClick={retryRecommendations} data-testid="button-recommendations-retry">
                <RotateCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          )}

          {recoUiState === 'ready' && recommendations.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
              {recommendations.map(slot => {
                const key = `${slot.date}|${slot.startTime}|${slot.employeeId}`;
                const isSelected = selectedSuggestion === key;
                const emp = employees.find(e => e.id === slot.employeeId);
                const employeeName = emp?.name ?? 'Unassigned';
                const dayLabel = (() => {
                  try { return format(new Date(slot.date + 'T00:00:00'), 'EEE MMM d'); } catch { return slot.date; }
                })();
                const detail = recommendationDetail(slot);
                return (
                  <Card
                    key={key}
                    onClick={() => applySuggestion(slot)}
                    className={`w-[85%] sm:w-72 shrink-0 snap-start p-4 cursor-pointer ${isSelected ? 'border-primary' : ''}`}
                    data-testid={`card-recommendation-${key}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[16px] font-semibold leading-tight">
                        {dayLabel} · {fmtTime(slot.startTime)}
                      </p>
                      <Badge variant="secondary" className="shrink-0">{employeeName}</Badge>
                    </div>
                    <p className="text-sm text-foreground mt-1.5">{recommendationReason(slot, employeeName)}</p>
                    {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
                    {slot.doubleAnchored && (
                      <Badge variant="outline" className="mt-2">Best fit</Badge>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Date & time ── */}
      {/* All-day and Repeats rows removed per FR-8/FR-9 — All-day's state was
          never sent to `useCreateBooking`, and Repeats was pure static
          decoration with no `onClick` behind it. Zero behavioral risk. */}
      <Section title="Date and time" icon={Calendar}>
        <button
          onClick={() => setShowDatePicker(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border bg-background hover:bg-muted/40 transition-colors min-h-[52px]"
        >
          <div className="text-left">
            <p className="text-[12px] text-muted-foreground font-medium">Date and time</p>
            <p className="text-[15px] font-medium mt-0.5">{dateLabel} at {fmtTime(time)}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </Section>

      {/* ── Notes ── */}
      <Section title="Appointment note" icon={FileText}>
        <textarea
          className="w-full px-4 py-3 rounded-2xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary transition-colors resize-none placeholder-muted-foreground/60"
          placeholder="Note for staff…"
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </Section>

      {/* Spacer for bottom safe area */}
      <div className="h-8" />

      {/* ── Bottom CTA ── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-md border-t border-border/40 px-5 py-4">
        <button
          onClick={handleSave}
          disabled={!canSave || createBookingMutation.isPending}
          className={`w-full py-4 rounded-2xl text-[17px] font-semibold transition-all ${
            canSave && !createBookingMutation.isPending ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {createBookingMutation.isPending
            ? 'Booking…'
            : canSave
              ? 'Book Appointment'
              : 'Fill in details to book'}
        </button>
      </div>

      {/* ── Customer page takeover ── */}
      {showCustomers && (
        <PageTakeover
          testId="takeover-customer-picker"
          title={creatingClient ? 'New customer' : 'Select customer'}
          showBack={creatingClient}
          onBack={() => {
            if (creatingClient) { setCreatingClient(false); return; }
            setShowCustomers(false);
          }}
        >
          {!creatingClient ? (
            <div>
              {/* Live search — filters existing clients and surfaces a
                  contextual "Add as new customer" action inline (FR-2). */}
              <div className="px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2 px-3 py-3 rounded-2xl bg-muted min-h-[52px]">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-[15px] focus:outline-none"
                    placeholder="Search or add a customer…"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="divide-y divide-border/30">
                {clientSearch.trim().length > 0 && (
                  <button
                    onClick={() => startQuickAddClient(clientSearch)}
                    className="w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors text-left min-h-[56px]"
                    data-testid="button-add-new-customer"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <UserPlus className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-[15px] font-medium text-primary">
                      Add "{clientSearch.trim()}" as new customer
                    </p>
                  </button>
                )}

                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c.id);
                      // FR-18 (existing-client coordinate auto-fill) is
                      // explicitly Phase 2 — clients don't have stored
                      // coordinates yet, so this only pre-fills the address
                      // *text*, same as before. Any prior selection is
                      // cleared: this text isn't geocoded until the owner
                      // re-selects it from suggestions.
                      if (c.address) setAddress(c.address);
                      setAddressSelection(null);
                      setShowCustomers(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left min-h-[56px]"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold shrink-0">
                      {c.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium">{c.name}</p>
                      <p className="text-[12px] text-muted-foreground">{c.phone}</p>
                    </div>
                    {selectedClient === c.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}

                {filteredClients.length === 0 && clientSearch.trim().length === 0 && (
                  <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    No customers yet — type a name above to add one.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-5 space-y-3">
              {/* FR-3: First name, Last name, phone number only — email and
                  address are dropped from this fast path (FR-4). Labels match
                  this file's own "Date" micro-label convention below, for
                  in-screen consistency and a real accessible name once the
                  placeholder disappears behind typed text. */}
              <div>
                <label htmlFor="quick-client-first" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  First name
                </label>
                <input
                  id="quick-client-first"
                  type="text"
                  className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] focus:outline-none focus:border-primary transition-colors bg-background"
                  placeholder="First name"
                  value={newClient.firstName}
                  onChange={e => setNewClient(p => ({ ...p, firstName: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="quick-client-last" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Last name
                </label>
                <input
                  id="quick-client-last"
                  type="text"
                  className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] focus:outline-none focus:border-primary transition-colors bg-background"
                  placeholder="Last name"
                  value={newClient.lastName}
                  onChange={e => setNewClient(p => ({ ...p, lastName: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="quick-client-phone" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Phone number
                </label>
                <input
                  id="quick-client-phone"
                  type="tel"
                  className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] focus:outline-none focus:border-primary transition-colors bg-background"
                  placeholder="Phone number"
                  value={newClient.phone}
                  onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <button
                onClick={handleCreateClient}
                disabled={!newClientValid || createClientMutation.isPending}
                className={`w-full py-4 mt-2 rounded-2xl text-[15px] font-semibold transition-all ${
                  newClientValid && !createClientMutation.isPending ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {createClientMutation.isPending ? 'Saving…' : 'Save customer'}
              </button>
              <div className="h-8" />
            </div>
          )}
        </PageTakeover>
      )}

      {/* ── Service page takeover ── */}
      {showServices && (
        <PageTakeover
          testId="takeover-service-picker"
          title={creatingPackage ? 'New package' : 'Select services'}
          showBack={creatingPackage}
          onBack={() => {
            if (creatingPackage) { setCreatingPackage(false); return; }
            setShowServices(false);
          }}
        >
          {!creatingPackage ? (
            <div className="px-4 py-2">
              {/* Live search — filters `pkgsByCategory` and surfaces a
                  contextual "Add as new package" action inline (FR-5), even
                  when a similar package already exists, so operators can add
                  variants. This replaces the old zero-packages deep-link to
                  Settings entirely. */}
              <div className="py-3 border-b border-border/40">
                <div className="flex items-center gap-2 px-3 py-3 rounded-2xl bg-muted min-h-[52px]">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-[15px] focus:outline-none"
                    placeholder="Search or add a package…"
                    value={serviceSearch}
                    onChange={e => setServiceSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {serviceSearch.trim().length > 0 && (
                <button
                  onClick={() => startQuickAddPackage(serviceSearch)}
                  className="w-full flex items-center gap-3 px-3.5 py-4 my-3 rounded-2xl border-2 border-dashed border-primary/40 hover:bg-primary/5 transition-colors text-left min-h-[56px]"
                  data-testid="button-add-new-package"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-[15px] font-medium text-primary">
                    Add "{serviceSearch.trim()}" as a new package
                  </p>
                </button>
              )}

              {Object.entries(pkgsByCategory).map(([category, pkgs]) => (
                <div key={category} className="mb-5">
                  <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide px-1 py-2">{category}</p>
                  <div className="space-y-2.5">
                    {pkgs.map(pkg => {
                      const selected = selectedPackages.includes(pkg.id);
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => setSelectedPackages(p => selected ? p.filter(id => id !== pkg.id) : [...p, pkg.id])}
                          className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all min-h-[56px] ${
                            selected ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                            selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold">{pkg.name}</p>
                            <p className="text-[12px] text-muted-foreground mt-0.5">{pkg.description}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {pkg.durationMinutes} min
                              </span>
                            </div>
                          </div>
                          <p className="text-[15px] font-bold tabular-nums shrink-0">${pkg.price}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filteredPackages.length === 0 && serviceSearch.trim().length === 0 && (
                <p className="px-1 py-8 text-center text-[13px] text-muted-foreground">
                  No packages yet — type a name above to add your first one.
                </p>
              )}

              {selectedPackages.length > 0 && (
                <div className="sticky bottom-0 bg-background/95 pb-4 pt-2 backdrop-blur-md">
                  <button
                    onClick={() => setShowServices(false)}
                    className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white"
                  >
                    Done · {selectedPackages.length} service{selectedPackages.length !== 1 ? 's' : ''} · ${totalPrice}
                  </button>
                </div>
              )}
              <div className="h-8" />
            </div>
          ) : (
            <div className="px-4 py-5 space-y-3">
              {/* FR-6: name, price, duration, category, description — all
                  five required by the real `packages` schema. Category
                  defaults to 'Full' but stays changeable. `isAddon` derives
                  automatically from category, no separate control. Labels
                  match this file's own "Date" micro-label convention below. */}
              <div>
                <label htmlFor="quick-pkg-name" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Package name
                </label>
                <input
                  id="quick-pkg-name"
                  type="text"
                  className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] focus:outline-none focus:border-primary transition-colors bg-background"
                  placeholder="Package name"
                  value={newPackage.name}
                  onChange={e => setNewPackage(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="quick-pkg-price" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Price
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border bg-background">
                  <span className="text-[15px] text-muted-foreground">$</span>
                  <input
                    id="quick-pkg-price"
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1 text-[15px] bg-transparent focus:outline-none"
                    placeholder="Price"
                    value={newPackage.price}
                    onChange={e => setNewPackage(p => ({ ...p, price: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="quick-pkg-duration" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Duration
                </label>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border bg-background">
                  <input
                    id="quick-pkg-duration"
                    type="number"
                    min="1"
                    step="5"
                    className="flex-1 text-[15px] bg-transparent focus:outline-none"
                    placeholder="Duration"
                    value={newPackage.durationMinutes}
                    onChange={e => setNewPackage(p => ({ ...p, durationMinutes: e.target.value }))}
                  />
                  <span className="text-[15px] text-muted-foreground">min</span>
                </div>
              </div>
              <div>
                <label htmlFor="quick-pkg-category" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Category
                </label>
                <Select
                  value={newPackage.category}
                  onValueChange={(v) => setNewPackage(p => ({ ...p, category: v as CreatePackageRequestCategory }))}
                >
                  <SelectTrigger id="quick-pkg-category" className="h-auto w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Exterior">Exterior</SelectItem>
                    <SelectItem value="Interior">Interior</SelectItem>
                    <SelectItem value="Full">Full</SelectItem>
                    <SelectItem value="Add-on">Add-on</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="quick-pkg-description" className="block text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Description
                </label>
                <textarea
                  id="quick-pkg-description"
                  className="w-full px-4 py-3.5 rounded-2xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary transition-colors resize-none placeholder-muted-foreground/60"
                  placeholder="Description"
                  rows={3}
                  value={newPackage.description}
                  onChange={e => setNewPackage(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <button
                onClick={handleCreatePackage}
                disabled={!newPackageValid || createPackageMutation.isPending}
                className={`w-full py-4 mt-2 rounded-2xl text-[15px] font-semibold transition-all ${
                  newPackageValid && !createPackageMutation.isPending ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {createPackageMutation.isPending ? 'Saving…' : 'Save package'}
              </button>
              <div className="h-8" />
            </div>
          )}
        </PageTakeover>
      )}

      {/* ── Date picker sheet (unchanged — stays a bottom sheet per Section 8) ── */}
      <BottomSheet open={showDatePicker} onClose={() => setShowDatePicker(false)} title="Date and time">
        <div className="px-4 py-4 space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Date</p>
            <input
              type="date"
              className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] bg-background focus:outline-none focus:border-primary"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Time</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMES.map(t => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  className={`py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    time === t ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/70'
                  }`}
                >
                  {fmtTime(t)}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setShowDatePicker(false)}
            className="w-full py-4 rounded-2xl gradient-btn text-white text-[17px] font-semibold"
          >
            Confirm · {dateLabel} at {fmtTime(time)}
          </button>
          <div className="h-4" />
        </div>
      </BottomSheet>
    </div>
  );
}
