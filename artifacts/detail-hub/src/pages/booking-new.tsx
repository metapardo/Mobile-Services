import { useState } from 'react';
import { useLocation } from 'wouter';
import { clients, packages, employees, createBooking, createClient, getGasMeter, getWeather, settings } from '@/lib/mock-data';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import { GasMeterBadge } from '@/components/gas-meter-badge';
import { WeatherBadge } from '@/components/weather-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function BookingNew() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [newClientData, setNewClientData] = useState({ name: '', phone: '', email: '', address: '' });
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [deposit, setDeposit] = useState('0');
  const [parking, setParking] = useState('0');
  const [showGasBreakdown, setShowGasBreakdown] = useState(false);

  const packagesByCategory = packages.reduce((acc, pkg) => {
    if (!acc[pkg.category]) acc[pkg.category] = [];
    acc[pkg.category].push(pkg);
    return acc;
  }, {} as Record<string, typeof packages>);

  const totalPrice = selectedPackages.reduce((sum, id) => {
    const pkg = packages.find(p => p.id === id);
    return sum + (pkg?.price || 0);
  }, 0);

  const gasMeter = address && date ? getGasMeter(address, totalPrice, settings) : null;
  const weather = date ? getWeather(date) : null;

  const handleCreateClient = () => {
    const newClient = createClient(newClientData);
    setSelectedClient(newClient.id);
    setStep(2);
  };

  const handleFinish = () => {
    if (!selectedClient || selectedPackages.length === 0 || !date || !time || !address || selectedEmployees.length === 0) {
      return;
    }

    const employeeSplit = selectedEmployees.map(id => ({
      employeeId: id,
      percentage: Math.floor(100 / selectedEmployees.length),
    }));

    const newBooking = createBooking({
      clientId: selectedClient,
      packageIds: selectedPackages,
      employeeIds: selectedEmployees,
      date,
      startTime: time,
      address,
      depositAmount: parseFloat(deposit) || 0,
      parkingCost: parseFloat(parking) || 0,
      status: parseFloat(deposit) > 0 ? 'confirmed' : 'pending',
      employeeSplit,
    });

    setLocation(`/booking/${newBooking.id}`);
  };

  const progress = (step / 5) * 100;

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/calendar" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to Calendar</span>
        </Link>

        <h1 className="text-2xl font-semibold mb-2">New Booking</h1>
        <p className="text-[15px] text-muted-foreground mb-6">Step {step} of 5</p>

        <div className="h-1 bg-muted rounded-full mb-8">
          <div
            className="h-full bg-primary rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Select Client</h2>
            <div className="space-y-2 mb-6">
              {clients.map(client => (
                <Card
                  key={client.id}
                  onClick={() => setSelectedClient(client.id)}
                  className={`p-4 border rounded-xl cursor-pointer transition-colors ${
                    selectedClient === client.id ? 'border-primary bg-[var(--accent-subtle)]' : 'border-border hover:bg-muted'
                  }`}
                  data-testid={`client-${client.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[15px]">{client.name}</p>
                      <p className="text-[13px] text-muted-foreground">{client.phone}</p>
                    </div>
                    {selectedClient === client.id && <Check className="w-5 h-5 text-primary" />}
                  </div>
                </Card>
              ))}
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-[15px] font-medium mb-3">Or create new client</h3>
              <div className="space-y-3">
                <Input
                  placeholder="Name"
                  value={newClientData.name}
                  onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                  data-testid="input-client-name"
                />
                <Input
                  placeholder="Phone"
                  value={newClientData.phone}
                  onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                  data-testid="input-client-phone"
                />
                <Button
                  variant="outline"
                  onClick={handleCreateClient}
                  disabled={!newClientData.name || !newClientData.phone}
                  className="w-full"
                  data-testid="button-create-client"
                >
                  Create & Continue
                </Button>
              </div>
            </div>

            <Button
              onClick={() => setStep(2)}
              disabled={!selectedClient}
              className="w-full mt-6"
              data-testid="button-next"
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Select Services</h2>
            {Object.entries(packagesByCategory).map(([category, pkgs]) => (
              <div key={category} className="mb-6">
                <h3 className="text-[15px] font-medium text-muted-foreground mb-2">{category}</h3>
                <div className="space-y-2">
                  {pkgs.map(pkg => (
                    <Card
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackages(prev =>
                          prev.includes(pkg.id) ? prev.filter(id => id !== pkg.id) : [...prev, pkg.id]
                        );
                      }}
                      className={`p-4 border rounded-xl cursor-pointer transition-colors ${
                        selectedPackages.includes(pkg.id) ? 'border-primary bg-[var(--accent-subtle)]' : 'border-border hover:bg-muted'
                      }`}
                      data-testid={`package-${pkg.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-[15px]">{pkg.name}</p>
                            {selectedPackages.includes(pkg.id) && <Check className="w-4 h-4 text-primary" />}
                          </div>
                          <p className="text-[13px] text-muted-foreground mb-2">{pkg.description}</p>
                          <p className="text-[13px] text-muted-foreground">{pkg.durationMinutes} min</p>
                        </div>
                        <p className="text-[15px] font-medium tabular-nums">${pkg.price}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {selectedPackages.length > 0 && (
              <Card className="p-4 border border-border rounded-xl mb-6">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-medium">Total</p>
                  <p className="text-[18px] font-semibold tabular-nums">${totalPrice.toFixed(2)}</p>
                </div>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={selectedPackages.length === 0}
                className="flex-1"
                data-testid="button-next"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Schedule</h2>
            <div className="space-y-4">
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
                  placeholder="Service address"
                  data-testid="input-address"
                />
              </div>

              {gasMeter && weather && (
                <div className="flex gap-2 pt-2">
                  <GasMeterBadge gasMeter={gasMeter} onClick={() => setShowGasBreakdown(true)} />
                  <WeatherBadge weather={weather} />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={() => setStep(4)}
                disabled={!date || !time || !address}
                className="flex-1"
                data-testid="button-next"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Team & Deposit</h2>
            <div className="space-y-4">
              <div>
                <Label>Assign Employees</Label>
                <div className="space-y-2 mt-2">
                  {employees.map(emp => (
                    <Card
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployees(prev =>
                          prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                        );
                      }}
                      className={`p-3 border rounded-xl cursor-pointer transition-colors ${
                        selectedEmployees.includes(emp.id) ? 'border-primary bg-[var(--accent-subtle)]' : 'border-border hover:bg-muted'
                      }`}
                      data-testid={`employee-${emp.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: emp.color }} />
                          <p className="text-[15px]">{emp.name}</p>
                        </div>
                        {selectedEmployees.includes(emp.id) && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="deposit">Deposit Amount</Label>
                <Input
                  id="deposit"
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="0.00"
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
                  placeholder="0.00"
                  data-testid="input-parking"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={() => setStep(5)}
                disabled={selectedEmployees.length === 0}
                className="flex-1"
                data-testid="button-next"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Review & Confirm</h2>
            <Card className="p-4 border border-border rounded-xl mb-6">
              <div className="space-y-3">
                <div>
                  <p className="text-[13px] text-muted-foreground">Client</p>
                  <p className="text-[15px]">{clients.find(c => c.id === selectedClient)?.name}</p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">Services</p>
                  <p className="text-[15px]">
                    {selectedPackages.map(id => packages.find(p => p.id === id)?.name).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">Date & Time</p>
                  <p className="text-[15px]">{date} at {time}</p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">Address</p>
                  <p className="text-[15px]">{address}</p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">Team</p>
                  <p className="text-[15px]">
                    {selectedEmployees.map(id => employees.find(e => e.id === id)?.name).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">Total</p>
                  <p className="text-[18px] font-semibold tabular-nums">${totalPrice.toFixed(2)}</p>
                </div>
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                Back
              </Button>
              <Button onClick={handleFinish} className="flex-1" data-testid="button-confirm">
                {parseFloat(deposit) > 0 ? `Charge $${deposit} Deposit` : 'Book Appointment'}
              </Button>
            </div>
          </div>
        )}

        {gasMeter && (
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
        )}
      </div>
    </div>
  );
}
