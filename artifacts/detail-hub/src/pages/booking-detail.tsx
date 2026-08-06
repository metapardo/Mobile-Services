import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { bookings, clients, packages, employees, updateBooking, deleteBooking, getGasMeter, getWeather, settings, BookingStatus } from '@/lib/mock-data';
import { ArrowLeft, Trash2, Plus, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/status-badge';
import { GasMeterBadge } from '@/components/gas-meter-badge';
import { WeatherBadge } from '@/components/weather-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useLocation } from 'wouter';

export default function BookingDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const bookingId = parseInt(params.id || '0');
  const booking = bookings.find(b => b.id === bookingId);
  
  const [status, setStatus] = useState(booking?.status || 'pending');
  const [date, setDate] = useState(booking?.date || '');
  const [time, setTime] = useState(booking?.startTime || '');
  const [address, setAddress] = useState(booking?.address || '');
  const [deposit, setDeposit] = useState(booking?.depositAmount.toString() || '0');
  const [parking, setParking] = useState(booking?.parkingCost.toString() || '0');
  const [notes, setNotes] = useState(booking?.notes || '');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>(booking?.employeeIds || []);
  const [employeeSplit, setEmployeeSplit] = useState(booking?.employeeSplit || []);
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>(booking?.packageIds || []);
  const [showGasBreakdown, setShowGasBreakdown] = useState(false);
  const [showAddService, setShowAddService] = useState(false);

  if (!booking) {
    return (
      <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <p>Booking not found</p>
        </div>
      </div>
    );
  }

  const client = clients.find(c => c.id === booking.clientId);
  const pkgs = selectedPackageIds.map(id => packages.find(p => p.id === id)!).filter(Boolean);
  const totalPrice = pkgs.reduce((sum, p) => sum + p.price, 0);
  const gasMeter = getGasMeter(address, totalPrice, settings);
  const weather = getWeather(date);

  const handleSave = () => {
    const updatedSplit = selectedEmployees.map(id => {
      const existing = employeeSplit.find(s => s.employeeId === id);
      return existing || { employeeId: id, percentage: Math.floor(100 / selectedEmployees.length) };
    });

    updateBooking(bookingId, {
      status: status as BookingStatus,
      date,
      startTime: time,
      address,
      packageIds: selectedPackageIds,
      depositAmount: parseFloat(deposit) || 0,
      parkingCost: parseFloat(parking) || 0,
      notes,
      employeeIds: selectedEmployees,
      employeeSplit: updatedSplit,
    });
  };

  const handleDelete = () => {
    deleteBooking(bookingId);
    setLocation('/calendar');
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
            <h1 className="text-2xl font-semibold mb-2">{client?.name}</h1>
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
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
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
              <p className="text-[15px]">{client?.name}</p>
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
              <div className="flex gap-2 pt-1">
                <GasMeterBadge gasMeter={gasMeter} onClick={() => setShowGasBreakdown(true)} />
                <WeatherBadge weather={weather} />
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-border rounded-xl">
            <h3 className="text-[15px] font-medium mb-3">Team</h3>
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
            <h3 className="text-[15px] font-medium mb-3">Payment</h3>
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
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white transition-all"
            data-testid="button-save"
          >
            Save Changes
          </button>
        </div>

        <Dialog open={showGasBreakdown} onOpenChange={setShowGasBreakdown}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gas Cost Breakdown</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distance (one way)</span>
                <span className="tabular-nums">{gasMeter.distanceMiles} mi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round trip</span>
                <span className="tabular-nums">{gasMeter.roundTrip} mi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas cost</span>
                <span className="tabular-nums">${gasMeter.gasCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">% of booking</span>
                <span className="tabular-nums">{(gasMeter.ratio * 100).toFixed(1)}%</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
