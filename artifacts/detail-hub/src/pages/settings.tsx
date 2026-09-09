import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSettings, useUpdateSettings, getGetSettingsQueryKey,
  type SettingsResult, type UpdateSettingsRequest,
} from '@workspace/api-client-react';
import { ArrowLeft, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { SetupWizard } from '@/components/setup-wizard';
import { getSetupProfile } from '@/lib/setup-store';
import { AddressAutocomplete } from '@/components/address-autocomplete';

// Local form shape mirrors `SettingsResult` — `hqLatitude`/`hqLongitude`/
// `hqGooglePlaceId` are nullable on the wire (PRD_Mobull_Fuel_Gauge_Accuracy
// _Rework.md FR-2/FR-24/§9.4); everything else is required, matching the
// real schema's `NOT NULL` columns + defaults.
interface SettingsFormState {
  homeAddress: string;
  hqLatitude: number | null;
  hqLongitude: number | null;
  hqGooglePlaceId: string | null;
  gasPrice: number;
  vehicleMpg: number;
  techHourlyCost: number;
  commissionRate: number;
  gasThresholdGreen: number;
  gasThresholdAmber: number;
  fuelGaugeHalfMi: number;
  fuelGaugeFullMi: number;
  fuelGaugeHalfMin: number;
  fuelGaugeFullMin: number;
  paymentProcessorConnected: boolean;
  cardReaderPaired: boolean;
}

// Mirrors `SETTINGS_DEFAULTS` in `lib/db/src/settings.ts` — used only when
// `GET /settings` 404s (no row yet for this organization: a legacy account
// that predates auto-created defaults, or a signup-time insert that failed).
// Seeding the form with these instead of showing a fatal error lets the
// owner fill in Home Base Address and Save, which now self-heals by
// creating the row (see `updateSettings`'s upsert fallback).
const DEFAULT_FORM_STATE: SettingsFormState = {
  homeAddress: '',
  hqLatitude: null,
  hqLongitude: null,
  hqGooglePlaceId: null,
  gasPrice: 6,
  vehicleMpg: 28,
  techHourlyCost: 22,
  commissionRate: 25,
  gasThresholdGreen: 10,
  gasThresholdAmber: 20,
  fuelGaugeHalfMi: 3,
  fuelGaugeFullMi: 8,
  fuelGaugeHalfMin: 1.5,
  fuelGaugeFullMin: 4,
  paymentProcessorConnected: false,
  cardReaderPaired: false,
};

function toFormState(s: SettingsResult): SettingsFormState {
  return {
    homeAddress: s.homeAddress,
    hqLatitude: s.hqLatitude ?? null,
    hqLongitude: s.hqLongitude ?? null,
    hqGooglePlaceId: s.hqGooglePlaceId ?? null,
    gasPrice: s.gasPrice,
    vehicleMpg: s.vehicleMpg,
    techHourlyCost: s.techHourlyCost,
    commissionRate: s.commissionRate,
    gasThresholdGreen: s.gasThresholdGreen,
    gasThresholdAmber: s.gasThresholdAmber,
    fuelGaugeHalfMi: s.fuelGaugeHalfMi,
    fuelGaugeFullMi: s.fuelGaugeFullMi,
    fuelGaugeHalfMin: s.fuelGaugeHalfMin,
    fuelGaugeFullMin: s.fuelGaugeFullMin,
    paymentProcessorConnected: s.paymentProcessorConnected,
    cardReaderPaired: s.cardReaderPaired,
  };
}

function toUpdateRequest(f: SettingsFormState): UpdateSettingsRequest {
  return {
    homeAddress: f.homeAddress,
    hqLatitude: f.hqLatitude ?? undefined,
    hqLongitude: f.hqLongitude ?? undefined,
    hqGooglePlaceId: f.hqGooglePlaceId ?? undefined,
    gasPrice: f.gasPrice,
    vehicleMpg: f.vehicleMpg,
    techHourlyCost: f.techHourlyCost,
    commissionRate: f.commissionRate,
    gasThresholdGreen: f.gasThresholdGreen,
    gasThresholdAmber: f.gasThresholdAmber,
    fuelGaugeHalfMi: f.fuelGaugeHalfMi,
    fuelGaugeFullMi: f.fuelGaugeFullMi,
    fuelGaugeHalfMin: f.fuelGaugeHalfMin,
    fuelGaugeFullMin: f.fuelGaugeFullMin,
    paymentProcessorConnected: f.paymentProcessorConnected,
    cardReaderPaired: f.cardReaderPaired,
  };
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const setupProfile = getSetupProfile();

  // `retry: false` — a 404 here means "no settings row yet," a normal steady
  // state for a legacy org, not a transient failure worth retrying 3x with
  // backoff. Retrying delays the recoverable-form fallback below for no
  // benefit, and (observed in manual testing) can leave the query paused
  // indefinitely if a retry attempt coincides with any connectivity blip.
  const settingsQuery = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), retry: false } });
  const [formData, setFormData] = useState<SettingsFormState | null>(null);
  const initialized = useRef(false);

  // Seed local form state once from the fetched settings — a plain `useState`
  // default can't see async query data, and re-seeding on every refetch would
  // clobber whatever the owner is mid-typing. A 404 specifically means "no
  // settings row yet" (not a real failure) — seed defaults instead so the
  // owner can fill in Home Base Address and Save, which creates the row.
  // Any other error (network, 500) is not treated this way — see the
  // settingsQuery.isError branch below, which still shows a real error.
  useEffect(() => {
    if (initialized.current) return;
    if (settingsQuery.data) {
      setFormData(toFormState(settingsQuery.data));
      initialized.current = true;
    } else if ((settingsQuery.error as { status?: number } | null)?.status === 404) {
      setFormData(DEFAULT_FORM_STATE);
      initialized.current = true;
    }
  }, [settingsQuery.data, settingsQuery.error]);

  const updateSettingsMutation = useUpdateSettings({
    mutation: {
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        setFormData(toFormState(updated));
        toast({
          title: 'Settings saved',
          description: 'Your settings have been updated successfully.',
        });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving your settings. Please try again.';
        toast({ title: 'Couldn’t save settings', description: message, variant: 'destructive' });
      },
    },
  });

  const handleSave = () => {
    if (!formData || updateSettingsMutation.isPending) return;
    updateSettingsMutation.mutate({ data: toUpdateRequest(formData) });
  };

  // A 404 is handled above (seeded defaults, editable form) — only a genuine
  // failure (network, 500, etc.) without recovered form data is fatal here.
  if (settingsQuery.isError && !formData) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-4 text-center bg-background" data-testid="status-settings-error">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-[15px] font-semibold">Couldn't load settings</p>
        <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
      </div>
    );
  }

  if (settingsQuery.isLoading || !formData) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background" data-testid="status-settings-loading">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

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
              {/* PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-24 — same address
                  typeahead as the booking screen's Location field. No
                  `originLat`/`originLng` bias here: there's no existing HQ to
                  bias suggestions around when you're setting HQ itself. */}
              <AddressAutocomplete
                id="homeAddress"
                value={formData.homeAddress}
                onTextChange={(text) => setFormData(f => f && {
                  ...f,
                  homeAddress: text,
                  // Free typing after a prior selection means the text no
                  // longer matches those coordinates — clear the stale
                  // geocode rather than silently keeping it (FR-17's spirit:
                  // a retyped address goes back to ungeocoded until
                  // re-selected).
                  hqLatitude: null,
                  hqLongitude: null,
                  hqGooglePlaceId: null,
                })}
                onSelect={(place) => setFormData(f => f && {
                  ...f,
                  homeAddress: place.formattedAddress,
                  hqLatitude: place.latitude,
                  hqLongitude: place.longitude,
                  hqGooglePlaceId: place.placeId,
                })}
                placeholder="Business address"
                data-testid="input-home-address"
              />
              <p className="text-[13px] text-muted-foreground mt-1">
                Used to calculate travel distance for jobs. Select a suggestion to score jobs against real
                coordinates — a typed-but-unselected address won't be geocoded.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-4">Travel Cost Settings</h2>
          <p className="text-[13px] text-muted-foreground mb-4">
            Used to price the Fuel Gauge's fuel and drive-time cost lines and the booking form's smart
            time-slot suggestions.
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="gasPrice">Gas Price per Gallon</Label>
              <Input
                id="gasPrice"
                type="number"
                step="0.01"
                value={formData.gasPrice}
                onChange={(e) => setFormData(f => f && { ...f, gasPrice: parseFloat(e.target.value) })}
                data-testid="input-gas-price"
              />
            </div>
            <div>
              <Label htmlFor="vehicleMpg">Vehicle MPG</Label>
              <Input
                id="vehicleMpg"
                type="number"
                value={formData.vehicleMpg}
                onChange={(e) => setFormData(f => f && { ...f, vehicleMpg: parseInt(e.target.value) })}
                data-testid="input-vehicle-mpg"
              />
            </div>
            <div>
              <Label htmlFor="techHourlyCost">Technician Hourly Cost</Label>
              <Input
                id="techHourlyCost"
                type="number"
                step="0.01"
                min="0"
                value={formData.techHourlyCost}
                onChange={(e) => setFormData(f => f && { ...f, techHourlyCost: parseFloat(e.target.value) })}
                data-testid="input-tech-hourly-cost"
              />
              <p className="text-[13px] text-muted-foreground mt-1">
                What one hour of your technician's time costs you. Used to price the drive.
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
                  onChange={(e) => setFormData(f => f && { ...f, fuelGaugeHalfMi: parseFloat(e.target.value) })}
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
                  onChange={(e) => setFormData(f => f && { ...f, fuelGaugeFullMi: parseFloat(e.target.value) })}
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
                  onChange={(e) => setFormData(f => f && { ...f, fuelGaugeHalfMin: parseFloat(e.target.value) })}
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
                  onChange={(e) => setFormData(f => f && { ...f, fuelGaugeFullMin: parseFloat(e.target.value) })}
                />
                <p className="text-[13px] text-muted-foreground mt-1">Full gauge when rate ≥ this — default $4/min</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Payments */}
        <Card className="p-6 border border-border rounded-xl mb-6">
          <h2 className="text-[18px] font-semibold mb-1">Payments</h2>
          <p className="text-[13px] text-muted-foreground mb-5">
            Processor connection and card reader pairing.
          </p>

          {/* Processor status */}
          <div className="flex items-center justify-between py-3.5 border-b border-border/50">
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-[15px] font-medium">Payment Processor</p>
              <p className="text-[12px] text-muted-foreground">Stripe Connect</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`text-[12px] font-semibold ${formData.paymentProcessorConnected ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {formData.paymentProcessorConnected ? 'Connected' : 'Not connected'}
              </span>
              <button
                onClick={() => setFormData(f => f && { ...f, paymentProcessorConnected: !f.paymentProcessorConnected })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  formData.paymentProcessorConnected ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                role="switch"
                aria-checked={formData.paymentProcessorConnected}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    formData.paymentProcessorConnected ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Card reader pairing */}
          <div className="flex items-center justify-between py-3.5 border-b border-border/50">
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-[15px] font-medium">Card Reader</p>
              <p className="text-[12px] text-muted-foreground">BBPOS WisePOS E</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`text-[12px] font-semibold ${formData.cardReaderPaired ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {formData.cardReaderPaired ? 'Paired' : 'Not paired'}
              </span>
              <button
                onClick={() => setFormData(f => f && { ...f, cardReaderPaired: !f.cardReaderPaired })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  formData.cardReaderPaired ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                role="switch"
                aria-checked={formData.cardReaderPaired}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    formData.cardReaderPaired ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Future threshold settings placeholder */}
          <div className="pt-3.5">
            <p className="text-[13px] font-medium text-muted-foreground">Processing fee thresholds</p>
            <p className="text-[12px] text-muted-foreground/70 mt-0.5">
              Auto-surcharge rules and fee visibility — coming soon.
            </p>
          </div>
        </Card>

        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
          className="w-full"
          data-testid="button-save"
        >
          {updateSettingsMutation.isPending ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>

      <SetupWizard open={showSetup} onClose={() => setShowSetup(false)} />
    </div>
  );
}
