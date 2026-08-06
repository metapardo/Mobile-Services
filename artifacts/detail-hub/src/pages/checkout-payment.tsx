/**
 * Checkout Payment — four large tappable options.
 * Cash / Zelle / Venmo → inline confirmation + optional note, no extra screens.
 * Credit Card → reader prompt (if paired) or manual CNP form → spinner → success/decline.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { packages, clients, bookings, updateBooking, settings } from '@/lib/mock-data';
import { getCart, clearCart } from '@/lib/cart-store';
import type { PaymentMethodId } from '@/lib/mock-data';
import {
  ArrowLeft, Banknote, CreditCard, Check,
  X as XIcon, Wifi, Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ── helpers ───────────────────────────────────────────────────────────────────

function computeTotal(cart: ReturnType<typeof getCart>) {
  const grouped = cart.items.reduce((acc, item) => {
    const found = acc.find(i => i.packageId === item.packageId);
    if (found) found.qty += 1;
    else acc.push({ packageId: item.packageId, qty: 1 });
    return acc;
  }, [] as { packageId: number; qty: number }[]);
  const subtotal = grouped.reduce((s, i) => {
    const pkg = packages.find(p => p.id === i.packageId);
    return s + (pkg?.price ?? 0) * i.qty;
  }, 0);
  const discount = (subtotal * cart.discountPercent) / 100;
  return { subtotal, discount, total: subtotal - discount + cart.tip };
}

type Screen = 'select' | 'confirm' | 'card-entry' | 'card-processing' | 'card-decline' | 'success';

interface MethodDef {
  id: PaymentMethodId;
  label: string;
  sub: string;
  color: string;
}

const METHODS: MethodDef[] = [
  { id: 'cash',  label: 'Cash',         sub: 'Mark as paid in cash',            color: '#10B981' },
  { id: 'zelle', label: 'Zelle',        sub: 'Mark as received via Zelle',       color: '#6D28D9' },
  { id: 'venmo', label: 'Venmo',        sub: 'Mark as received via Venmo',       color: '#0284C7' },
  { id: 'card',  label: 'Credit Card',  sub: 'Swipe, tap, or enter card details', color: '#3654FF' },
];

function MethodIcon({ id }: { id: PaymentMethodId }) {
  if (id === 'cash')  return <Banknote className="w-5 h-5" />;
  if (id === 'card')  return <CreditCard className="w-5 h-5" />;
  if (id === 'zelle') return <span className="text-[18px] font-black leading-none">Z</span>;
  if (id === 'venmo') return <span className="text-[18px] font-black leading-none">V</span>;
  return null;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CheckoutPayment() {
  const [, setLocation] = useLocation();
  const cart = getCart();
  const { total } = computeTotal(cart);

  const client = cart.clientId != null ? clients.find(c => c.id === cart.clientId) ?? null : null;
  const linkedBooking = cart.bookingId != null ? bookings.find(b => b.id === cart.bookingId) ?? null : null;
  const linkedClient = linkedBooking ? clients.find(c => c.id === linkedBooking.clientId) ?? null : null;
  const displayName = linkedClient?.name ?? client?.name ?? null;

  const [screen, setScreen] = useState<Screen>('select');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | null>(null);
  const [note, setNote] = useState('');

  // Manual card form state
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry]         = useState('');
  const [cvv, setCvv]               = useState('');
  const [zip, setZip]               = useState('');

  function finalizePay(method: PaymentMethodId, paymentNote?: string) {
    if (cart.bookingId != null) {
      updateBooking(cart.bookingId, {
        status: 'completed',
        paymentMethod: method,
        ...(paymentNote ? { paymentNote } : {}),
      });
    }
    setScreen('success');
    setTimeout(() => {
      clearCart();
      setLocation('/checkout');
    }, 2500);
  }

  function handleMethodTap(m: PaymentMethodId) {
    setSelectedMethod(m);
    setNote('');
    if (m === 'card') {
      setScreen('card-entry');
    } else {
      setScreen('confirm');
    }
  }

  function handleChargeCard() {
    setScreen('card-processing');
    // Simulate processing (always succeeds in mock)
    setTimeout(() => finalizePay('card'), 2000);
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (screen === 'success') {
    const method = METHODS.find(m => m.id === selectedMethod);
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-24 h-24 rounded-full bg-[#1E9E62]/12 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#1E9E62]/20 flex items-center justify-center">
            <Check className="w-9 h-9 text-[#1E9E62]" strokeWidth={2.5} />
          </div>
        </div>
        <div>
          <p className="text-[26px] font-bold mb-1">Payment Received</p>
          <p className="text-[17px] text-muted-foreground tabular-nums">${total.toFixed(2)}</p>
          {displayName && <p className="text-[15px] text-muted-foreground mt-1">{displayName}</p>}
          {linkedBooking && (
            <p className="text-[14px] text-[#1E9E62] font-medium mt-1">
              Booking {linkedBooking.startTime} marked complete
            </p>
          )}
          {method && (
            <p className="text-[13px] text-muted-foreground mt-3">via {method.label}</p>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground opacity-60 mt-2">Returning to checkout…</p>
      </div>
    );
  }

  // ── Card declined ─────────────────────────────────────────────────────────
  if (screen === 'card-decline') {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <XIcon className="w-9 h-9 text-destructive" strokeWidth={2.5} />
          </div>
        </div>
        <div>
          <p className="text-[26px] font-bold mb-1">Card Declined</p>
          <p className="text-[17px] text-muted-foreground tabular-nums">${total.toFixed(2)}</p>
          <p className="text-[13px] text-muted-foreground mt-2">
            The card was declined. Please try a different payment method.
          </p>
        </div>
        <div className="w-full space-y-3">
          <button
            onClick={() => setScreen('card-entry')}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white"
          >
            Try Again
          </button>
          <button
            onClick={() => { setSelectedMethod(null); setScreen('select'); }}
            className="w-full py-3 text-[15px] font-medium text-muted-foreground"
          >
            Choose different method
          </button>
        </div>
      </div>
    );
  }

  // ── Card processing ───────────────────────────────────────────────────────
  if (screen === 'card-processing') {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-5 px-8 text-center">
        <Loader2 className="w-14 h-14 text-primary animate-spin" />
        <div>
          <p className="text-[22px] font-bold mb-1">Processing…</p>
          <p className="text-[17px] text-muted-foreground tabular-nums">${total.toFixed(2)}</p>
        </div>
      </div>
    );
  }

  // ── Card entry (reader or manual) ─────────────────────────────────────────
  if (screen === 'card-entry') {
    const readerPaired = settings.cardReaderPaired;
    const cardReady = cardNumber.replace(/\s/g, '').length === 16 && expiry.length === 5 && cvv.length >= 3;

    return (
      <div className="min-h-[100dvh] bg-background pb-8">
        <div className="px-5 pt-6 pb-4 flex items-center gap-3">
          <button
            onClick={() => setScreen('select')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-[17px] font-semibold">Credit Card</p>
        </div>

        <div className="px-5">
          <p className="text-[46px] font-black tracking-tight tabular-nums leading-none mb-1">
            ${total.toFixed(2)}
          </p>
          {displayName && (
            <p className="text-[15px] text-muted-foreground mb-6">{displayName}</p>
          )}

          {readerPaired ? (
            /* ── Reader present ── */
            <div className="rounded-2xl border border-border bg-muted/30 p-7 flex flex-col items-center gap-4 text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Wifi className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-[17px] font-semibold">Present card to reader</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Tap, swipe, or insert — BBPOS WisePOS E
                </p>
              </div>
              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary/50 animate-pulse"
                    style={{ animationDelay: `${i * 220}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* ── Manual card-not-present form ── */
            <div className="space-y-4 mb-6">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Card Details
              </p>
              <div>
                <Label htmlFor="card-num">Card Number</Label>
                <Input
                  id="card-num"
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  value={cardNumber}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                    setCardNumber(raw.replace(/(.{4})/g, '$1 ').trim());
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="expiry">Expiry</Label>
                  <Input
                    id="expiry"
                    inputMode="numeric"
                    placeholder="MM / YY"
                    maxLength={5}
                    value={expiry}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setExpiry(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    inputMode="numeric"
                    placeholder="123"
                    maxLength={4}
                    value={cvv}
                    onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="zip">Billing ZIP</Label>
                <Input
                  id="zip"
                  inputMode="numeric"
                  placeholder="10001"
                  maxLength={5}
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleChargeCard}
            disabled={!readerPaired && !cardReady}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Charge ${total.toFixed(2)}
          </button>
        </div>
      </div>
    );
  }

  // ── Inline confirmation (Cash / Zelle / Venmo) ────────────────────────────
  if (screen === 'confirm' && selectedMethod) {
    const method = METHODS.find(m => m.id === selectedMethod)!;
    return (
      <div className="min-h-[100dvh] bg-background pb-8">
        <div className="px-5 pt-6 pb-4 flex items-center gap-3">
          <button
            onClick={() => setScreen('select')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-[17px] font-semibold">{method.label}</p>
        </div>

        <div className="px-5">
          <p className="text-[46px] font-black tracking-tight tabular-nums leading-none mb-1">
            ${total.toFixed(2)}
          </p>
          {displayName && (
            <p className="text-[15px] text-muted-foreground mb-6">{displayName}</p>
          )}

          {/* Confirmation pill */}
          <div className="rounded-2xl border border-border bg-muted/30 p-5 mb-5 flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: method.color }}
            >
              <MethodIcon id={selectedMethod} />
            </div>
            <div>
              <p className="text-[15px] font-semibold">Marked paid via {method.label}</p>
              <p className="text-[12px] text-muted-foreground">No processing fee</p>
            </div>
          </div>

          {/* Optional note */}
          <div className="mb-6">
            <Label htmlFor="pay-note" className="text-[13px]">Note (optional)</Label>
            <Textarea
              id="pay-note"
              placeholder={`e.g. confirmation #12345 or reference code`}
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          <button
            onClick={() => finalizePay(selectedMethod, note.trim() || undefined)}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    );
  }

  // ── Method selection (default) ────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      {/* Header */}
      <div className="px-5 pt-6 pb-2 flex items-center gap-3">
        <button
          onClick={() => setLocation('/checkout/review')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
          aria-label="Back to review"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5">
        {/* Big amount */}
        <div className="pt-2 pb-7">
          <p className="text-[62px] font-black tracking-tight leading-none tabular-nums">
            ${total.toFixed(2)}
          </p>
          {displayName && (
            <p className="text-[16px] text-muted-foreground mt-2">{displayName}</p>
          )}
        </div>

        {/* 4 large tappable rows */}
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border/60">
          {METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => handleMethodTap(m.id)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted/70 transition-colors text-left"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: m.color }}
              >
                <MethodIcon id={m.id} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-semibold">{m.label}</p>
                <p className="text-[12px] text-muted-foreground">{m.sub}</p>
              </div>
              <svg
                width="16" height="16" viewBox="0 0 16 16" fill="none"
                className="text-muted-foreground shrink-0"
              >
                <path
                  d="M6 12l4-4-4-4"
                  stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
