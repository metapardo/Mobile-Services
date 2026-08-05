import React, { useState } from 'react';
import { X, ArrowLeft, ChevronRight, Lock, Check, Building2, Car, CreditCard, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getSetupProfile, updateSetupProfile, completeSetup,
  BUSINESS_CATEGORIES, BUSINESS_STRUCTURES, PAYMENT_PROCESSORS,
} from '@/lib/setup-store';

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
}

type Step =
  | 'phone'
  | 'address'
  | 'address-input'
  | 'biz-category'
  | 'biz-subtype'
  | 'biz-name'
  | 'biz-structure'
  | 'review'
  | 'processor'
  | 'bank'
  | 'done';

const STEP_ORDER: Step[] = [
  'phone', 'address', 'biz-category', 'biz-subtype',
  'biz-name', 'biz-structure', 'review', 'processor', 'bank', 'done',
];

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i <= current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

function NextBtn({ label = 'Next', onClick, disabled = false }: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-5 bg-background/95 backdrop-blur-sm border-t border-border/40">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-4 rounded-2xl text-[17px] font-semibold transition-all ${
          disabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'gradient-btn text-white'
        }`}
      >
        {label}
      </button>
    </div>
  );
}

export function SetupWizard({ open, onClose }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('phone');
  const [profile, setProfile] = useState(() => getSetupProfile());

  if (!open) return null;

  const stepIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1; // exclude 'done'

  const patch = (updates: Parameters<typeof updateSetupProfile>[0]) => {
    updateSetupProfile(updates);
    setProfile(p => ({ ...p, ...updates }));
  };

  const goNext = () => {
    const cur = STEP_ORDER.indexOf(step);
    // Skip address-input step handling (inline on address step)
    if (step === 'address' && !profile.isStorefront) {
      setStep('biz-category');
    } else {
      const next = STEP_ORDER[cur + 1];
      if (next) setStep(next);
    }
  };

  const goBack = () => {
    if (step === 'phone') { onClose(); return; }
    const cur = STEP_ORDER.indexOf(step);
    if (cur > 0) setStep(STEP_ORDER[cur - 1]);
  };

  const handleDone = () => { completeSetup(); onClose(); };

  // ── Step: Phone ────────────────────────────────────────────────────────────
  const renderPhone = () => (
    <div className="px-5 pt-8 pb-32">
      <h1 className="text-[28px] font-bold leading-tight mb-3">What is your business phone number?</h1>
      <p className="text-[15px] text-muted-foreground mb-8">We'll use this number to contact you. We don't sell your information to third parties.</p>
      <div className="border-2 border-foreground rounded-2xl px-4 py-4 mb-4 focus-within:border-primary transition-colors">
        <p className="text-[12px] font-semibold mb-1">Business phone number</p>
        <div className="flex items-center gap-2">
          <span className="text-[17px] text-muted-foreground">+1</span>
          <input
            autoFocus
            type="tel"
            className="flex-1 text-[17px] bg-transparent focus:outline-none placeholder-muted-foreground/50"
            placeholder="(000) 000-0000"
            value={profile.phone}
            onChange={e => patch({ phone: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        <span className="text-[13px]">Your information is secure</span>
      </div>
      <NextBtn onClick={goNext} disabled={profile.phone.replace(/\D/g, '').length < 10} />
    </div>
  );

  // ── Step: Address ──────────────────────────────────────────────────────────
  const renderAddress = () => (
    <div className="px-5 pt-8 pb-32">
      <h1 className="text-[28px] font-bold leading-tight mb-2">Business address</h1>
      <p className="text-[16px] font-semibold mt-6 mb-1">Does your business have a storefront address?</p>
      <p className="text-[14px] text-muted-foreground mb-6">Your storefront address will be used on your receipts.</p>
      <div className="flex gap-3 mb-6">
        {[
          { val: true,  label: 'Yes', icon: Building2 },
          { val: false, label: 'No (Mobile)', icon: Car },
        ].map(({ val, label, icon: Icon }) => (
          <button
            key={String(val)}
            onClick={() => patch({ isStorefront: val })}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-[15px] font-medium transition-all ${
              profile.isStorefront === val ? 'border-primary bg-primary/8 text-primary' : 'border-border text-foreground hover:border-foreground/40'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {profile.isStorefront && (
        <div className="border-2 border-foreground rounded-2xl px-4 py-4 mb-4 focus-within:border-primary transition-colors">
          <p className="text-[12px] font-semibold mb-1">Street address</p>
          <input
            type="text"
            className="w-full text-[17px] bg-transparent focus:outline-none"
            placeholder="123 Main Street, City, State"
            value={profile.storefrontAddress}
            onChange={e => patch({ storefrontAddress: e.target.value })}
          />
        </div>
      )}

      {!profile.isStorefront && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-[14px] text-blue-800">
          <Car className="w-5 h-5 mb-2 text-blue-600" />
          <p className="font-semibold">Mobile service enabled</p>
          <p className="mt-0.5 text-blue-700">Fuel cost ROI will appear on each booking to help you stay profitable on every job.</p>
        </div>
      )}

      <NextBtn onClick={goNext} disabled={profile.isStorefront === null || (profile.isStorefront && !profile.storefrontAddress)} />
    </div>
  );

  // ── Step: Business category ────────────────────────────────────────────────
  const renderBizCategory = () => (
    <div className="px-5 pt-8 pb-10">
      <h1 className="text-[28px] font-bold leading-tight mb-6">What type of business do you run?</h1>
      <div className="divide-y divide-border/60">
        {BUSINESS_CATEGORIES.map(cat => (
          <button
            key={cat.label}
            onClick={() => { patch({ businessCategory: cat.label }); goNext(); }}
            className={`w-full flex items-center justify-between py-4 text-left transition-colors hover:bg-muted/50 -mx-1 px-1 rounded-xl ${
              profile.businessCategory === cat.label ? 'text-primary' : ''
            }`}
          >
            <span className="text-[17px]">{cat.label}</span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );

  // ── Step: Business sub-type ────────────────────────────────────────────────
  const renderBizSubtype = () => {
    const cat = BUSINESS_CATEGORIES.find(c => c.label === profile.businessCategory);
    return (
      <div className="px-5 pt-8 pb-10">
        <h1 className="text-[28px] font-bold leading-tight mb-2">And which of these best describes…</h1>
        <p className="text-muted-foreground mb-6">{profile.businessCategory}</p>
        <div className="divide-y divide-border/60">
          {(cat?.subTypes ?? []).map(sub => (
            <button
              key={sub}
              onClick={() => { patch({ businessSubType: sub }); goNext(); }}
              className={`w-full flex items-center justify-between py-4 text-left hover:bg-muted/50 -mx-1 px-1 rounded-xl transition-colors ${
                profile.businessSubType === sub ? 'text-primary' : ''
              }`}
            >
              <span className="text-[17px]">{sub}</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ── Step: Business name ────────────────────────────────────────────────────
  const renderBizName = () => (
    <div className="px-5 pt-8 pb-32">
      <h1 className="text-[28px] font-bold leading-tight mb-3">What's your business name?</h1>
      <p className="text-[15px] text-muted-foreground mb-8">This appears on receipts and client communications.</p>
      <div className="border-2 border-foreground rounded-2xl px-4 py-4 mb-6 focus-within:border-primary transition-colors">
        <p className="text-[12px] font-semibold mb-1">Business name</p>
        <input
          autoFocus
          type="text"
          className="w-full text-[17px] bg-transparent focus:outline-none"
          placeholder="e.g. DetailHub Pro"
          value={profile.businessName}
          onChange={e => patch({ businessName: e.target.value })}
        />
      </div>
      <div className="border-2 border-border rounded-2xl px-4 py-4 focus-within:border-primary transition-colors">
        <p className="text-[12px] font-semibold mb-1">EIN (optional)</p>
        <input
          type="text"
          className="w-full text-[17px] bg-transparent focus:outline-none placeholder-muted-foreground/50"
          placeholder="xx-xxxxxxx"
          value={profile.ein}
          onChange={e => patch({ ein: e.target.value })}
        />
      </div>
      <NextBtn onClick={goNext} disabled={!profile.businessName.trim()} />
    </div>
  );

  // ── Step: Business structure ───────────────────────────────────────────────
  const renderBizStructure = () => (
    <div className="px-5 pt-8 pb-10">
      <h1 className="text-[28px] font-bold leading-tight mb-2">What's your business structure?</h1>
      <p className="text-[15px] text-muted-foreground mb-6">This affects your tax obligations. Consult an accountant if unsure.</p>
      <div className="space-y-3">
        {BUSINESS_STRUCTURES.map(s => (
          <button
            key={s.value}
            onClick={() => { patch({ businessStructure: s.value }); goNext(); }}
            className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
              profile.businessStructure === s.value ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
              profile.businessStructure === s.value ? 'border-primary' : 'border-muted-foreground/40'
            }`}>
              {profile.businessStructure === s.value && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="text-[16px] font-semibold">{s.label}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Step: Review ───────────────────────────────────────────────────────────
  const renderReview = () => {
    const rows = [
      { label: 'Business structure', value: BUSINESS_STRUCTURES.find(s => s.value === profile.businessStructure)?.label || '—', step: 'biz-structure' as Step },
      { label: 'Business name', value: profile.businessName || '—', step: 'biz-name' as Step },
      { label: 'Employee Identification Number (EIN)', value: profile.ein || '—', step: 'biz-name' as Step },
      { label: 'Business phone number', value: profile.phone || '—', step: 'phone' as Step },
      { label: 'Business address', value: profile.isStorefront ? (profile.storefrontAddress || '—') : 'Mobile Business', step: 'address' as Step },
      { label: 'Business category & type', value: `${profile.businessCategory}\n${profile.businessSubType}`, step: 'biz-category' as Step },
    ];
    return (
      <div className="px-5 pt-8 pb-32">
        <h1 className="text-[28px] font-bold leading-tight mb-8">Review your information</h1>
        <div className="divide-y divide-border/50">
          {rows.map(row => (
            <div key={row.label} className="flex items-start justify-between py-4">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[16px] font-medium whitespace-pre-line">{row.value}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">{row.label}</p>
              </div>
              <button onClick={() => setStep(row.step)} className="text-muted-foreground hover:text-foreground mt-1 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <NextBtn label="Continue to Payment Setup" onClick={goNext} />
      </div>
    );
  };

  // ── Step: Payment processor ────────────────────────────────────────────────
  const renderProcessor = () => (
    <div className="px-5 pt-8 pb-32">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <CreditCard className="w-6 h-6 text-primary" />
      </div>
      <h1 className="text-[28px] font-bold leading-tight mb-2">Connect your payment processor</h1>
      <p className="text-[15px] text-muted-foreground mb-8">Accept cards and digital payments from your customers.</p>
      <div className="space-y-3">
        {PAYMENT_PROCESSORS.map(p => (
          <button
            key={p.id}
            onClick={() => patch({ paymentProcessor: p.id as any })}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
              profile.paymentProcessor === p.id ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
            }`}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-[13px] font-bold" style={{ backgroundColor: p.color }}>
              {p.label[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold">{p.label}</p>
              <p className="text-[13px] text-muted-foreground">{p.sub}</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
              profile.paymentProcessor === p.id ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            }`}>
              {profile.paymentProcessor === p.id && <Check className="w-3 h-3 text-white" />}
            </div>
          </button>
        ))}
      </div>
      <NextBtn onClick={goNext} disabled={!profile.paymentProcessor} label={profile.paymentProcessor === 'cash' ? 'Skip bank setup →' : 'Connect & Continue'} />
    </div>
  );

  // ── Step: Bank ─────────────────────────────────────────────────────────────
  const renderBank = () => (
    <div className="px-5 pt-8 pb-32">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Landmark className="w-6 h-6 text-primary" />
      </div>
      <h1 className="text-[28px] font-bold leading-tight mb-2">Connect your bank account</h1>
      <p className="text-[15px] text-muted-foreground mb-8">Payouts from {profile.paymentProcessor || 'your processor'} will be deposited here. Demo only — no real linking.</p>
      <div className="space-y-4">
        {[
          { key: 'bankName',    label: 'Bank name',              placeholder: 'Chase, Bank of America…' },
          { key: 'bankRouting', label: 'Routing number',          placeholder: '9-digit ABA number' },
          { key: 'bankAccount', label: 'Account number',          placeholder: 'Checking account number' },
        ].map(f => (
          <div key={f.key} className="border-2 border-border rounded-2xl px-4 py-4 focus-within:border-primary transition-colors">
            <p className="text-[12px] font-semibold mb-1">{f.label}</p>
            <input
              type={f.key === 'bankName' ? 'text' : 'number'}
              className="w-full text-[17px] bg-transparent focus:outline-none placeholder-muted-foreground/40"
              placeholder={f.placeholder}
              value={(profile as any)[f.key]}
              onChange={e => patch({ [f.key]: e.target.value } as any)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4 text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        <span className="text-[13px]">256-bit encrypted · demo only</span>
      </div>
      <NextBtn
        onClick={goNext}
        label={profile.bankName ? 'Save & Finish' : 'Skip for now'}
      />
    </div>
  );

  // ── Step: Done ─────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Check className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-[32px] font-bold mb-3">You're all set!</h1>
      <p className="text-[16px] text-muted-foreground mb-10">
        {profile.businessName} is ready to take bookings.
        {!profile.isStorefront && ' Fuel ROI tracking is active for your mobile jobs.'}
      </p>
      <div className="w-full space-y-3">
        <div className="p-4 rounded-2xl bg-muted/50 text-left">
          <p className="text-[13px] text-muted-foreground">Business</p>
          <p className="text-[15px] font-semibold">{profile.businessName} · {profile.isStorefront ? 'Storefront' : 'Mobile'}</p>
        </div>
        {profile.paymentProcessor && (
          <div className="p-4 rounded-2xl bg-muted/50 text-left">
            <p className="text-[13px] text-muted-foreground">Payment processor</p>
            <p className="text-[15px] font-semibold capitalize">{PAYMENT_PROCESSORS.find(p => p.id === profile.paymentProcessor)?.label}</p>
          </div>
        )}
      </div>
      <button
        onClick={handleDone}
        className="w-full mt-8 py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white"
      >
        Start using DetailHub
      </button>
    </div>
  );

  const stepRenderer: Record<Step, () => React.ReactNode> = {
    phone:          renderPhone,
    address:        renderAddress,
    'address-input': renderAddress,
    'biz-category': renderBizCategory,
    'biz-subtype':  renderBizSubtype,
    'biz-name':     renderBizName,
    'biz-structure':renderBizStructure,
    review:         renderReview,
    processor:      renderProcessor,
    bank:           renderBank,
    done:           renderDone,
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border/30">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition-colors"
        >
          {step === 'phone' ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </button>
        <div className="flex-1 flex justify-center">
          {step !== 'done' && <ProgressDots current={stepIdx} total={totalSteps} />}
        </div>
        <div className="w-9" /> {/* spacer */}
      </div>

      {/* Step content */}
      {stepRenderer[step]?.()}
    </div>
  );
}
