import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  clients, packages, employees, bookings, createBooking, createClient,
  getGasMeter, settings,
} from '@/lib/mock-data';
import { getSetupProfile } from '@/lib/setup-store';
import { suggestSlots, SuggestedSlot } from '@/lib/suggest-slots';
import {
  X, Check, ChevronDown, ChevronRight, UserPlus, Plus,
  Fuel, Search, Clock, DollarSign, Calendar, Users, FileText, Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parse } from 'date-fns';

// ─── Bottom sheet wrapper ────────────────────────────────────────────────────
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

// ─── Section heading ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-2 mb-3">
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
      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-muted hover:bg-muted/70 transition-colors text-[15px] font-medium"
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingNew() {
  const [, setLocation] = useLocation();
  const setup = getSetupProfile();

  // Form state
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' });
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  const [address, setAddress] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [deposit, setDeposit] = useState('');
  const [parking, setParking] = useState('');
  const [notes, setNotes] = useState('');
  const [allDay, setAllDay] = useState(false);

  // Bottom sheets
  const [showCustomers, setShowCustomers] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showGasModal, setShowGasModal] = useState(false);

  // Search
  const [clientSearch, setClientSearch] = useState('');

  // Suggested slots
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null); // key = date|time|empId

  const suggestions = useMemo<SuggestedSlot[]>(() => {
    if (!address.trim() || address.length < 6) return [];
    const dur = selectedPackages.reduce((s, id) => {
      const pkg = packages.find(p => p.id === id);
      return s + (pkg?.durationMinutes ?? 0);
    }, 0);
    const price = selectedPackages.reduce((s, id) => {
      const pkg = packages.find(p => p.id === id);
      return s + (pkg?.price ?? 0);
    }, 0);
    return suggestSlots(address, dur || 120, price || 0, bookings, packages, settings);
  }, [address, selectedPackages]);

  const applySuggestion = (slot: SuggestedSlot) => {
    const key = `${slot.date}|${slot.startTime}|${slot.employeeId}`;
    setDate(slot.date);
    setTime(slot.startTime);
    setSelectedEmployees([slot.employeeId]);
    setSelectedSuggestion(key);
  };

  const canSave = selectedClient !== null && selectedPackages.length > 0 && address.trim() && selectedEmployees.length > 0;

  const selectedClientObj = clients.find(c => c.id === selectedClient);
  const selectedPkgs = packages.filter(p => selectedPackages.includes(p.id));
  const totalPrice = selectedPkgs.reduce((s, p) => s + p.price, 0);
  const totalDuration = selectedPkgs.reduce((s, p) => s + p.durationMinutes, 0);

  const gasMeter = address && date ? getGasMeter(address, totalPrice || 1, settings) : null;
  const isMobile = !setup.isStorefront;

  // Formatted display values
  const dateLabel = (() => {
    try { return format(new Date(date + 'T00:00:00'), 'EEE, MMM d'); }
    catch { return date; }
  })();

  const handleSave = () => {
    if (!canSave) return;
    const split = selectedEmployees.map(id => ({
      employeeId: id,
      percentage: Math.floor(100 / selectedEmployees.length),
    }));
    const booking = createBooking({
      clientId: selectedClient!,
      packageIds: selectedPackages,
      employeeIds: selectedEmployees,
      date, startTime: time, address,
      depositAmount: parseFloat(deposit) || 0,
      parkingCost: parseFloat(parking) || 0,
      status: parseFloat(deposit) > 0 ? 'confirmed' : 'pending',
      notes,
      employeeSplit: split,
    });
    setLocation(`/booking/${booking.id}`);
  };

  const handleCreateClient = () => {
    const full = `${newClient.firstName} ${newClient.lastName}`.trim();
    if (!full || !newClient.phone) return;
    const c = createClient({ name: full, phone: newClient.phone, email: newClient.email, address: newClient.address });
    setSelectedClient(c.id);
    if (newClient.address) setAddress(newClient.address);
    setShowCustomers(false);
    setCreatingClient(false);
    setNewClient({ firstName: '', lastName: '', phone: '', email: '', address: '' });
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const pkgsByCategory = packages.reduce<Record<string, typeof packages>>((acc, pkg) => {
    if (!acc[pkg.category]) acc[pkg.category] = [];
    acc[pkg.category].push(pkg);
    return acc;
  }, {});

  return (
    <div className="min-h-[100dvh] pb-24 bg-background">
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
          disabled={!canSave}
          className={`px-4 py-1.5 rounded-2xl text-[15px] font-semibold transition-all ${
            canSave ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          Save
        </button>
      </div>

      {/* ── Customer ── */}
      <Section title="Customer" icon={Users}>
        {selectedClientObj ? (
          <div
            className="flex items-center gap-3 p-3 rounded-2xl border border-primary bg-primary/5 cursor-pointer"
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
              <div key={pkg.id} className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium">{pkg.name}</p>
                  <p className="text-[12px] text-muted-foreground">{pkg.durationMinutes} min</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-semibold tabular-nums">${pkg.price}</p>
                  <button
                    onClick={() => setSelectedPackages(p => p.filter(id => id !== pkg.id))}
                    className="w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
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
        <input
          type="text"
          className="w-full px-4 py-3.5 rounded-2xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground/60"
          placeholder="Client address or service location"
          value={address}
          onChange={e => setAddress(e.target.value)}
        />

        {/* Gas meter ROI for mobile businesses */}
        {isMobile && gasMeter && (
          <div className="mt-3">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all hover:brightness-95"
              style={{
                borderColor: gasMeter.status === 'green' ? '#1E9E62' : gasMeter.status === 'amber' ? '#D9A404' : '#DC2626',
                background:  gasMeter.status === 'green' ? 'rgba(30,158,98,0.06)' : gasMeter.status === 'amber' ? 'rgba(217,164,4,0.06)' : 'rgba(220,38,38,0.06)',
              }}
              onClick={() => setShowGasModal(true)}
            >
              <Fuel className="w-5 h-5 shrink-0" style={{ color: gasMeter.status === 'green' ? '#1E9E62' : gasMeter.status === 'amber' ? '#D9A404' : '#DC2626' }} />
              <div className="flex-1">
                <p className="text-[13px] font-semibold" style={{ color: gasMeter.status === 'green' ? '#1E9E62' : gasMeter.status === 'amber' ? '#D9A404' : '#DC2626' }}>
                  Fuel ROI: {(gasMeter.ratio * 100).toFixed(1)}% of job value
                </p>
                <p className="text-[12px] text-muted-foreground">{gasMeter.roundTrip} mi · ${gasMeter.gasCost.toFixed(2)} gas cost</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        )}
        {isMobile && !gasMeter && address.trim() === '' && (
          <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1.5">
            <Fuel className="w-3 h-3" /> Add address to see fuel ROI
          </p>
        )}
      </Section>

      {/* ── Suggested times pills ── */}
      {suggestions.length > 0 && (
        <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <p className="text-[12px] font-semibold text-primary uppercase tracking-wide">Smart suggestions</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {suggestions.map(slot => {
              const key = `${slot.date}|${slot.startTime}|${slot.employeeId}`;
              const isSelected = selectedSuggestion === key;
              const emp = employees.find(e => e.id === slot.employeeId);
              const dayLabel = (() => {
                try { return format(new Date(slot.date + 'T00:00:00'), 'EEE'); } catch { return ''; }
              })();
              const dateShort = (() => {
                try { return format(new Date(slot.date + 'T00:00:00'), 'M/d'); } catch { return slot.date; }
              })();
              const timeLabel = fmtTime(slot.startTime);
              return (
                <button
                  key={key}
                  onClick={() => applySuggestion(slot)}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-2xl border-2 transition-all
                    w-[calc((100%-5*6px)/6)] min-w-[54px]
                    ${isSelected
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-background hover:border-primary/50'
                    }`}
                  style={{ minWidth: 54 }}
                >
                  <span className={`text-[11px] font-bold leading-none ${isSelected ? 'text-white' : 'text-foreground'}`}>
                    {dayLabel}
                  </span>
                  <span className={`text-[10px] leading-none mt-0.5 ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {dateShort}
                  </span>
                  <span className={`text-[10px] font-semibold leading-none mt-1 ${isSelected ? 'text-white' : 'text-foreground'}`}>
                    {timeLabel.replace(' ', '\u00A0')}
                  </span>
                  {emp && (
                    <span
                      className="w-2 h-2 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : emp.color }}
                    />
                  )}
                  {slot.doubleAnchored && !isSelected && (
                    <Zap className="w-2.5 h-2.5 text-primary mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Date & time ── */}
      <Section title="Date and time" icon={Calendar}>
        <div className="space-y-2">
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border bg-background hover:bg-muted/40 transition-colors"
          >
            <div className="text-left">
              <p className="text-[12px] text-muted-foreground font-medium">Date and time</p>
              <p className="text-[15px] font-medium mt-0.5">{dateLabel} at {fmtTime(time)}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border bg-background">
            <p className="text-[15px]">All-day</p>
            <button
              onClick={() => setAllDay(v => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative ${allDay ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${allDay ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <button className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-border bg-background hover:bg-muted/40 transition-colors">
            <div className="text-left">
              <p className="text-[12px] text-muted-foreground font-medium">Repeats</p>
              <p className="text-[15px] font-medium mt-0.5">Never</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </Section>

      {/* ── Team ── */}
      <Section title="Team" icon={Users}>
        {selectedEmployees.length > 0 ? (
          <div className="space-y-2 mb-3">
            {selectedEmployees.map(id => {
              const emp = employees.find(e => e.id === id)!;
              return (
                <div key={id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-muted/50">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: emp.color }}>
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <p className="flex-1 text-[14px] font-medium">{emp.name}</p>
                  <button onClick={() => setSelectedEmployees(p => p.filter(i => i !== id))}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        <button
          onClick={() => setShowTeam(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-muted hover:bg-muted/70 transition-colors text-[15px] font-medium"
        >
          <Plus className="w-4 h-4" />
          {selectedEmployees.length > 0 ? 'Add another' : 'Assign team member'}
        </button>
      </Section>

      {/* ── Deposit & extras ── */}
      <Section title="Deposit & extras" icon={DollarSign}>
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border bg-background">
            <span className="text-[15px] text-muted-foreground">$</span>
            <input
              type="number"
              className="flex-1 text-[15px] bg-transparent focus:outline-none"
              placeholder="Deposit amount"
              value={deposit}
              onChange={e => setDeposit(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border bg-background">
            <span className="text-[15px] text-muted-foreground">$</span>
            <input
              type="number"
              className="flex-1 text-[15px] bg-transparent focus:outline-none"
              placeholder="Parking cost"
              value={parking}
              onChange={e => setParking(e.target.value)}
            />
          </div>
        </div>
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
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-md border-t border-border/40 px-5 py-4">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`w-full py-4 rounded-2xl text-[17px] font-semibold transition-all ${
            canSave ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {canSave
            ? (parseFloat(deposit) > 0 ? `Charge $${parseFloat(deposit).toFixed(2)} Deposit` : 'Book Appointment')
            : 'Fill in details to book'}
        </button>
      </div>

      {/* ── Customer bottom sheet ── */}
      <BottomSheet open={showCustomers} onClose={() => { setShowCustomers(false); setCreatingClient(false); }} title="Select customer">
        {!creatingClient ? (
          <div>
            {/* Search */}
            <div className="px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  className="flex-1 bg-transparent text-[15px] focus:outline-none"
                  placeholder="Search clients…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            {/* New customer button */}
            <button
              onClick={() => setCreatingClient(true)}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border/40 hover:bg-muted/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[15px] font-medium text-primary">New customer</p>
            </button>
            {/* Client list */}
            <div className="divide-y divide-border/30">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c.id); if (c.address) setAddress(c.address); setShowCustomers(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
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
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <button
              onClick={() => setCreatingClient(false)}
              className="flex items-center gap-1.5 text-primary text-[14px] mb-4"
            >
              ← Back to search
            </button>
            <h3 className="text-[20px] font-bold mb-4">New customer</h3>
            <button className="w-full py-3 rounded-2xl bg-muted text-[15px] font-medium hover:bg-muted/70 transition-colors">
              Import from contacts
            </button>
            {[
              { key: 'firstName', placeholder: 'First name' },
              { key: 'lastName',  placeholder: 'Last name'  },
              { key: 'phone',     placeholder: 'Phone number' },
              { key: 'email',     placeholder: 'Email address' },
              { key: 'address',   placeholder: 'Address (optional)' },
            ].map(f => (
              <input
                key={f.key}
                type={f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : 'text'}
                className="w-full px-4 py-3.5 rounded-2xl border border-border text-[15px] focus:outline-none focus:border-primary transition-colors bg-background"
                placeholder={f.placeholder}
                value={(newClient as any)[f.key]}
                onChange={e => setNewClient(p => ({ ...p, [f.key]: e.target.value }))}
              />
            ))}
            <button
              onClick={handleCreateClient}
              disabled={!newClient.firstName || !newClient.phone}
              className={`w-full py-4 mt-2 rounded-2xl text-[15px] font-semibold transition-all ${
                newClient.firstName && newClient.phone ? 'gradient-btn text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              Save customer
            </button>
            <div className="h-8" />
          </div>
        )}
      </BottomSheet>

      {/* ── Services bottom sheet ── */}
      <BottomSheet open={showServices} onClose={() => setShowServices(false)} title="Select services">
        <div className="px-4 py-2">
          {Object.entries(pkgsByCategory).map(([category, pkgs]) => (
            <div key={category} className="mb-4">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide px-1 py-2">{category}</p>
              <div className="space-y-2">
                {pkgs.map(pkg => {
                  const selected = selectedPackages.includes(pkg.id);
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPackages(p => selected ? p.filter(id => id !== pkg.id) : [...p, pkg.id])}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
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
          {selectedPackages.length > 0 && (
            <div className="sticky bottom-0 bg-background/95 pb-4 pt-2">
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
      </BottomSheet>

      {/* ── Date picker sheet ── */}
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

      {/* ── Team picker sheet ── */}
      <BottomSheet open={showTeam} onClose={() => setShowTeam(false)} title="Assign team">
        <div className="divide-y divide-border/30">
          {employees.map(emp => {
            const selected = selectedEmployees.includes(emp.id);
            return (
              <button
                key={emp.id}
                onClick={() => {
                  setSelectedEmployees(p => selected ? p.filter(id => id !== emp.id) : [...p, emp.id]);
                }}
                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
                  style={{ backgroundColor: emp.color }}>
                  {emp.name.split(' ').map(n => n[0]).join('')}
                </div>
                <p className="flex-1 text-[15px] font-medium">{emp.name}</p>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                }`}>
                  {selected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            );
          })}
          <div className="p-4">
            <button
              onClick={() => setShowTeam(false)}
              className="w-full py-4 rounded-2xl gradient-btn text-white text-[17px] font-semibold"
            >
              {selectedEmployees.length > 0 ? `Done · ${selectedEmployees.length} assigned` : 'Done'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Gas breakdown dialog ── */}
      {gasMeter && (
        <Dialog open={showGasModal} onOpenChange={setShowGasModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fuel ROI Breakdown</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {[
                ['Distance (one way)', `${gasMeter.distanceMiles} mi`],
                ['Round trip', `${gasMeter.roundTrip} mi`],
                ['Gas cost', `$${gasMeter.gasCost.toFixed(2)}`],
                ['Job value', `$${totalPrice || '—'}`],
                ['Gas as % of job', `${(gasMeter.ratio * 100).toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-[14px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{value}</span>
                </div>
              ))}
              <div className={`mt-2 p-3 rounded-xl text-[13px] font-medium ${
                gasMeter.status === 'green' ? 'bg-green-100 text-green-700' :
                gasMeter.status === 'amber' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {gasMeter.status === 'green' ? '✅ Profitable distance' :
                 gasMeter.status === 'amber' ? '⚠️ Getting expensive — consider a travel fee' :
                 '🚨 Fuel cost is eating your margin — raise price or skip this job'}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
