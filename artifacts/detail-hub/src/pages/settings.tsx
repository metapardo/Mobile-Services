import { useState } from 'react';
import { settings, updateSettings } from '@/lib/mock-data';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { SetupWizard } from '@/components/setup-wizard';
import { getSetupProfile } from '@/lib/setup-store';

export default function Settings() {
  const { toast } = useToast();
  const [formData, setFormData] = useState(settings);
  const [showSetup, setShowSetup] = useState(false);
  const setupProfile = getSetupProfile();

  const handleSave = () => {
    updateSettings(formData);
    toast({
      title: 'Settings saved',
      description: 'Your settings have been updated successfully.',
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/more" className="inline-flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[15px]">Back to More</span>
        </Link>

        <h1 className="text-2xl font-semibold mb-6">Settings</h1>

        {/* Account Setup Banner */}
        <Card className="p-5 border border-primary/30 bg-primary/5 rounded-xl mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold">
                {setupProfile.setupComplete ? 'Account configured' : 'Finish account setup'}
              </p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {setupProfile.setupComplete
                  ? `${setupProfile.businessName} · ${setupProfile.isStorefront ? 'Storefront' : 'Mobile service'} · ${setupProfile.paymentProcessor || 'No processor'}`
                  : 'Add your business info, service type, and payment processor to start taking bookings.'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowSetup(true)}
            variant={setupProfile.setupComplete ? 'outline' : 'default'}
            className="w-full mt-4"
          >
            {setupProfile.setupComplete ? 'Edit Setup' : 'Initial Setup'}
          </Button>
        </Card>

        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-4">Business Settings</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="homeAddress">Home Base Address</Label>
              <Input
                id="homeAddress"
                value={formData.homeAddress}
                onChange={(e) => setFormData({ ...formData, homeAddress: e.target.value })}
                data-testid="input-home-address"
              />
              <p className="text-[13px] text-muted-foreground mt-1">
                Used to calculate travel distance for jobs
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-4">Gas Meter Settings</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="gasPrice">Gas Price per Gallon</Label>
              <Input
                id="gasPrice"
                type="number"
                step="0.01"
                value={formData.gasPrice}
                onChange={(e) => setFormData({ ...formData, gasPrice: parseFloat(e.target.value) })}
                data-testid="input-gas-price"
              />
            </div>
            <div>
              <Label htmlFor="vehicleMpg">Vehicle MPG</Label>
              <Input
                id="vehicleMpg"
                type="number"
                value={formData.vehicleMpg}
                onChange={(e) => setFormData({ ...formData, vehicleMpg: parseInt(e.target.value) })}
                data-testid="input-vehicle-mpg"
              />
            </div>
            <div>
              <Label htmlFor="gasThresholdGreen">Green Threshold (%)</Label>
              <Input
                id="gasThresholdGreen"
                type="number"
                value={formData.gasThresholdGreen}
                onChange={(e) => setFormData({ ...formData, gasThresholdGreen: parseInt(e.target.value) })}
                data-testid="input-threshold-green"
              />
              <p className="text-[13px] text-muted-foreground mt-1">
                Show green when gas cost is ≤ this % of booking price
              </p>
            </div>
            <div>
              <Label htmlFor="gasThresholdAmber">Amber Threshold (%)</Label>
              <Input
                id="gasThresholdAmber"
                type="number"
                value={formData.gasThresholdAmber}
                onChange={(e) => setFormData({ ...formData, gasThresholdAmber: parseInt(e.target.value) })}
                data-testid="input-threshold-amber"
              />
              <p className="text-[13px] text-muted-foreground mt-1">
                Show amber when gas cost is ≤ this % of booking price
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-4">Fuel Gauge Thresholds</h2>
          <p className="text-[13px] text-muted-foreground mb-4">
            Controls when the calendar gauge shows Empty / Half / Full on each booking.
          </p>
          <div className="mb-3">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Miles mode (non-NYC)
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="fuelGaugeHalfMi">Half threshold ($/mile)</Label>
                <Input
                  id="fuelGaugeHalfMi"
                  type="number"
                  step="0.5"
                  value={formData.fuelGaugeHalfMi}
                  onChange={(e) => setFormData({ ...formData, fuelGaugeHalfMi: parseFloat(e.target.value) })}
                />
                <p className="text-[13px] text-muted-foreground mt-1">Half gauge when rate ≥ this — default $3/mi</p>
              </div>
              <div>
                <Label htmlFor="fuelGaugeFullMi">Full threshold ($/mile)</Label>
                <Input
                  id="fuelGaugeFullMi"
                  type="number"
                  step="0.5"
                  value={formData.fuelGaugeFullMi}
                  onChange={(e) => setFormData({ ...formData, fuelGaugeFullMi: parseFloat(e.target.value) })}
                />
                <p className="text-[13px] text-muted-foreground mt-1">Full gauge when rate ≥ this — default $8/mi</p>
              </div>
            </div>
          </div>
          <div className="border-t border-border/50 pt-3">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Minutes mode (NYC boroughs)
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="fuelGaugeHalfMin">Half threshold ($/minute)</Label>
                <Input
                  id="fuelGaugeHalfMin"
                  type="number"
                  step="0.25"
                  value={formData.fuelGaugeHalfMin}
                  onChange={(e) => setFormData({ ...formData, fuelGaugeHalfMin: parseFloat(e.target.value) })}
                />
                <p className="text-[13px] text-muted-foreground mt-1">Half gauge when rate ≥ this — default $1.50/min</p>
              </div>
              <div>
                <Label htmlFor="fuelGaugeFullMin">Full threshold ($/minute)</Label>
                <Input
                  id="fuelGaugeFullMin"
                  type="number"
                  step="0.25"
                  value={formData.fuelGaugeFullMin}
                  onChange={(e) => setFormData({ ...formData, fuelGaugeFullMin: parseFloat(e.target.value) })}
                />
                <p className="text-[13px] text-muted-foreground mt-1">Full gauge when rate ≥ this — default $4/min</p>
              </div>
            </div>
          </div>
        </Card>

        <Button onClick={handleSave} className="w-full" data-testid="button-save">
          Save Settings
        </Button>
      </div>

      <SetupWizard open={showSetup} onClose={() => setShowSetup(false)} />
    </div>
  );
}
