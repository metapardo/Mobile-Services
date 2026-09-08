import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetBooking, useUpdateBooking, useDeleteBooking,
  useListClients, useListPackages, useListEmployees,
  getGetBookingQueryKey, getListBookingsQueryKey,
  type UpdateBookingRequestStatus,
} from '@workspace/api-client-react';
import { evenSplit, normalizeSplitTo100, isoDateOnly } from '@/lib/api-adapters';
import { type BookingStatus } from '@/lib/mock-data';
import { ArrowLeft, Trash2, Plus, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { PaymentMethodBadge } from '@/components/payment-method-badge';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/blue-glass-design-system/components/ui/select';
import { StatusBadge } from '@/components/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/blue-glass-design-system/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@workspace/blue-glass-design-system/components/ui/alert-dialog';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';

export default function BookingDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bookingId = parseInt(params.id || '0');

  const bookingQuery = useGetBooking(bookingId, {
    query: { queryKey: getGetBookingQueryKey(bookingId), enabled: !!bookingId },
  });
  // `includeArchived`/`includeInactive` — this booking may reference a client/
  // package/employee that's since been retired; the detail view still needs to
  // resolve a real name for it (see the same note in `calendar.tsx`).
  const clientsQuery = useListClients({ includeArchived: true });
  const packagesQuery = useListPackages({ includeArchived: true });
  const employeesQuery = useListEmployees({ includeInactive: true });

  const booking = bookingQuery.data;
  const clients = clientsQuery.data ?? [];
  const packages = packagesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const [status, setStatus] = useState<BookingStatus>('pending');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [deposit, setDeposit] = useState('0');
  const [parking, setParking] = useState('0');
  const [notes, setNotes] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [employeeSplit, setEmployeeSplit] = useState<{ employeeId: number; percentage: number }[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  const [showAddService, setShowAddService] = useState(false);

  // Sync local edit state from the fetched booking. Keyed on the booking's own id
  // (not the whole `booking` object, which changes identity on every refetch after a
  // save) so an in-flight edit doesn't get silently clobbered by its own save
  // response — this only re-syncs when navigating to a genuinely different booking.
  useEffect(() => {
    if (booking) {
      setStatus(booking.status);
      setDate(isoDateOnly(booking.date));
      setTime(booking.startTime);
      setAddress(booking.address);
      setDeposit(String(booking.depositAmount));
      setParking(String(booking.parkingCost));
      setNotes(booking.notes ?? '');
      setSelectedEmployees(booking.employeeIds);
      setEmployeeSplit(booking.employeeSplit);
      setSelectedPackageIds(booking.packageIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  const updateBookingMutation = useUpdateBooking({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(bookingId) }),
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }),
        ]);
        toast({ title: 'Booking updated' });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving this booking. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  const deleteBookingMutation = useDeleteBooking({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        setLocation('/calendar');
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong deleting this booking. Please try again.';
        toast({ title: 'Delete failed', description: message, variant: 'destructive' });
      },
    },
  });

  if (bookingQuery.isLoading || clientsQuery.isLoading || packagesQuery.isLoading || employeesQuery.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6 flex items-center justify-center" data-testid="status-booking-detail-loading">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (bookingQuery.isError || !booking) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
        <div className="max-w-2xl mx-auto px-4 pt-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p>Booking not found</p>
          <Link href="/calendar" className="text-primary text-[14px]">Back to Calendar</Link>
        </div>
      </div>
    );
  }

  const client = clients.find(c => c.id === booking.clientId);
  const pkgs = selectedPackageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
  const totalPrice = pkgs.reduce((sum, p) => sum + p.price, 0);

  const handleSave = () => {
    // Fresh employees (just added via the Team list, no existing split entry yet)
    // fall back to an even distribution; employees with an existing/manually-edited
    // percentage (via the payroll-split inputs below) keep it. `normalizeSplitTo100`
    // then guarantees the final set sums to exactly 100 — required by the real API
    // (`POST/PATCH /bookings`), unlike the mock version this replaces which never
    // validated the split at all.
    const base = evenSplit(selectedEmployees);
    const updatedSplit = base.map(b => {
      const existing = employeeSplit.find(s => s.employeeId === b.employeeId);
      return existing ? { employeeId: b.employeeId, percentage: existing.percentage } : b;
    });
    const normalizedSplit = normalizeSplitTo100(updatedSplit);

    updateBookingMutation.mutate({
      id: bookingId,
      data: {
        status: status as UpdateBookingRequestStatus,
        date,
        startTime: time,
        address,
        packageIds: selectedPackageIds,
        depositAmount: parseFloat(deposit) || 0,
        parkingCost: parseFloat(parking) || 0,
        notes: notes.trim() ? notes.trim() : null,
        employeeSplit: normalizedSplit,
      },
    });
  };

  const handleDelete = () => {
    deleteBookingMutation.mutate({ id: bookingId });
  };

  const handleSplitChange = (employeeId: number, percentage: number) => {
    setEmployeeSplit(prev => {
      const updated = prev.filter(s => s.employeeId !== employeeId);
      updated.push({ employeeId, percentage });
      return updated;
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-48 md:pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/calendar" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to Calendar</span>
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold mb-2">{client?.name ?? 'Unknown client'}</h1>
            <StatusBadge status={status as BookingStatus} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-delete">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Booking</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this booking? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleteBookingMutation.isPending}>
                  {deleteBookingMutation.isPending ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-4">
          <Card className="p-4 border border-border rounded-xl">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
              <SelectTrigger id="status" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no-show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <h3 className="text-[15px] font-medium mb-3">Client</h3>
            <div className="space-y-1">
              <p className="text-[15px]">{client?.name ?? '—'}</p>
              <p className="text-[13px] text-muted-foreground">{client?.phone}</p>
              <p className="text-[13px] text-muted-foreground">{client?.email}</p>
            </div>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-medium">Services</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddService(true)}
                className="h-8 gap-1 text-primary"
                data-testid="button-add-service"
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {pkgs.length === 0 && (
                <p className="text-[13px] text-muted-foreground py-1">No services — tap Add to select one.</p>
              )}
              {pkgs.map(pkg => (
                <div key={pkg.id} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] truncate">{pkg.name}</p>
                    <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                  </div>
                  <p className="text-[15px] font-medium tabular-nums shrink-0">${pkg.price}</p>
                  <button
                    onClick={() => setSelectedPackageIds(ids => ids.filter(id => id !== pkg.id))}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                    aria-label={`Remove ${pkg.name}`}
                    data-testid={`remove-service-${pkg.id}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {pkgs.length > 0 && (
                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <p className="text-[15px] font-medium">Total</p>
                  <p className="text-[18px] font-semibold tabular-nums">${totalPrice.toFixed(2)}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <h3 className="text-[15px] font-medium mb-3">Schedule</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="input-date"
                />
              </div>
              <div>
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  data-testid="input-time"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  data-testid="input-address"
                />
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <h3 className="text-[15px] font-medium mb-3">Team</h3>
            {employees.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-1">
                No employees on this account yet — employee management isn't built in this app yet, so ask an admin to add one directly for now.
              </p>
            ) : (
              <div className="space-y-2">
                {employees.map(emp => {
                  const isSelected = selectedEmployees.includes(emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployees(prev =>
                          prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                        );
                      }}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-[var(--accent-subtle)]' : 'border-border hover:bg-muted'
                      }`}
                      data-testid={`employee-${emp.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: emp.color }} />
                        <p className="text-[15px]">{emp.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedEmployees.length > 1 && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-[13px] font-medium text-muted-foreground mb-2">Payroll Split</h4>
                <div className="space-y-2">
                  {selectedEmployees.map(empId => {
                    const emp = employees.find(e => e.id === empId);
                    const split = employeeSplit.find(s => s.employeeId === empId);
                    const payout = ((split?.percentage || 0) / 100) * totalPrice;

                    return (
                      <div key={empId} className="flex items-center gap-2">
                        <Label className="text-[13px] w-24">{emp?.name}</Label>
                        <Input
                          type="number"
                          value={split?.percentage || 0}
                          onChange={(e) => handleSplitChange(empId, parseInt(e.target.value) || 0)}
                          className="w-20"
                          data-testid={`input-split-${empId}`}
                        />
                        <span className="text-[13px] text-muted-foreground">%</span>
                        <span className="text-[13px] text-muted-foreground tabular-nums ml-auto">
                          ${payout.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-medium">Payment</h3>
              {booking.paymentMethod && (
                <PaymentMethodBadge method={booking.paymentMethod} size="sm" />
              )}
            </div>
            {booking.paymentNote && (
              <p className="text-[12px] text-muted-foreground mb-3 italic">"{booking.paymentNote}"</p>
            )}
            <div className="space-y-3">
              <div>
                <Label htmlFor="deposit">Deposit Amount</Label>
                <Input
                  id="deposit"
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  data-testid="input-deposit"
                />
              </div>
              <div>
                <Label htmlFor="parking">Parking Cost</Label>
                <Input
                  id="parking"
                  type="number"
                  value={parking}
                  onChange={(e) => setParking(e.target.value)}
                  data-testid="input-parking"
                />
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
              data-testid="input-notes"
            />
          </Card>

        </div>

        {/* ── Add service picker ─────────────────────────────────────────── */}
        <Dialog open={showAddService} onOpenChange={setShowAddService}>
          <DialogContent className="max-w-sm max-h-[80dvh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Service</DialogTitle>
            </DialogHeader>
            {packages.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-2">
                No packages on this account yet — package management isn't built in this app yet, so ask an admin to add one directly for now.
              </p>
            ) : (
              <div className="overflow-y-auto -mx-6 px-6 space-y-2 py-2 flex-1">
                {packages.map(pkg => {
                  const selected = selectedPackageIds.includes(pkg.id);
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackageIds(ids =>
                          selected ? ids.filter(id => id !== pkg.id) : [...ids, pkg.id]
                        );
                      }}
                      className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                        selected
                          ? 'border-primary bg-[var(--accent-subtle)]'
                          : 'border-border hover:bg-muted'
                      }`}
                      data-testid={`pick-service-${pkg.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium truncate">{pkg.name}</p>
                        <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <span className="text-[15px] font-medium tabular-nums">${pkg.price}</span>
                        {selected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="pt-3 border-t border-border">
              <Button className="w-full" onClick={() => setShowAddService(false)}>
                Done · {selectedPackageIds.length} service{selectedPackageIds.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Fixed bottom CTA — matches booking-new layout ── */}
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-md border-t border-border/40 px-5 py-4">
          <button
            onClick={handleSave}
            disabled={updateBookingMutation.isPending}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white transition-all disabled:opacity-60"
            data-testid="button-save"
          >
            {updateBookingMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
