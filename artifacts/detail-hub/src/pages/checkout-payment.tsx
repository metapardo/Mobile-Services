/**
 * Checkout Payment — four large tappable options.
 * Cash / Zelle / Venmo → inline confirmation + optional note, no extra screens —
 * recorded for real via `POST /bookings/:id/payment` (FR-15), then the linked
 * booking (if any) is marked `completed` via `PATCH /bookings/:id`.
 * Credit Card → disabled "Coming soon" option (FR-5/FR-17). There is no connected
 * payment processor and no real or simulated card-charge logic anywhere in this
 * codebase — see `docs/prds/PRD_DetailHub_Payment_Methods.md` Section 6.2/8.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { packages, clients, bookings } from '@/lib/mock-data';
import { getCart, clearCart } from '@/lib/cart-store';
import type { PaymentMethodId } from '@/lib/mock-data';
import {
  useRecordBookingPayment, useUpdateBooking,
  getGetBookingQueryKey, getListBookingsQueryKey,
} from '@workspace/api-client-react';
import {
  ArrowLeft, Banknote, CreditCard, Check, Loader2,
} from 'lucide-react';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';

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

type Screen = 'select' | 'confirm' | 'success';

interface MethodDef {
  id: PaymentMethodId;
  label: string;
  sub: string;
  color: string;
  /** FR-5/FR-17: Credit Card has no connected processor — shown, not tappable. */
  disabled?: boolean;
}

const METHODS: MethodDef[] = [
  { id: 'cash',  label: 'Cash',  sub: 'Mark as paid in cash',      color: '#10B981' },
  { id: 'zelle', label: 'Zelle', sub: 'Mark as received via Zelle', color: '#6D28D9' },
  { id: 'venmo', label: 'Venmo', sub: 'Mark as received via Venmo', color: '#0284C7' },
  {
    id: 'credit_card',
    label: 'Credit Card',
    sub: 'Coming soon — connect a payment processor in Settings',
    color: '#3654FF',
    disabled: true,
  },
];

function MethodIcon({ id }: { id: PaymentMethodId }) {
  if (id === 'cash')        return <Banknote className="w-5 h-5" />;
  if (id === 'credit_card') return <CreditCard className="w-5 h-5" />;
  if (id === 'zelle')       return <span className="text-[18px] font-black leading-none">Z</span>;
  if (id === 'venmo')       return <span className="text-[18px] font-black leading-none">V</span>;
  return null;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CheckoutPayment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cart = getCart();
  const { total } = computeTotal(cart);

  const client = cart.clientId != null ? clients.find(c => c.id === cart.clientId) ?? null : null;
  const linkedBooking = cart.bookingId != null ? bookings.find(b => b.id === cart.bookingId) ?? null : null;
  const linkedClient = linkedBooking ? clients.find(c => c.id === linkedBooking.clientId) ?? null : null;
  const displayName = linkedClient?.name ?? client?.name ?? null;

  const [screen, setScreen] = useState<Screen>('select');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | null>(null);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const recordPaymentMutation = useRecordBookingPayment();
  const completeBookingMutation = useUpdateBooking();

  // FR-15: Zelle/Venmo/Cash are recorded for real — `POST /bookings/:id/payment`
  // sets the payment fields, then `PATCH /bookings/:id` marks the linked booking
  // `completed` as a separate real call (no combined backend endpoint exists for
  // "record payment + complete booking" in one request). If the sale isn't linked
  // to a booking (a walk-in sale), there's nothing to persist against — the
  // success screen is shown but nothing is written, same as before this change.
  async function finalizePay(method: PaymentMethodId, paymentReference?: string) {
    if (cart.bookingId != null) {
      setIsSaving(true);
      try {
        await recordPaymentMutation.mutateAsync({
          id: cart.bookingId,
          data: { paymentMethod: method, paymentReference: paymentReference ?? null },
        });
        await completeBookingMutation.mutateAsync({
          id: cart.bookingId,
          data: { status: 'completed' },
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(cart.bookingId) }),
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() }),
        ]);
      } catch (err: any) {
        setIsSaving(false);
        const message = err?.data?.message ?? 'Something went wrong recording this payment. Please try again.';
        toast({ title: 'Payment not recorded', description: message, variant: 'destructive' });
        return;
      }
      setIsSaving(false);
    }
    setScreen('success');
    setTimeout(() => {
      clearCart();
      setLocation('/checkout');
    }, 2500);
  }

  function handleMethodTap(m: PaymentMethodId) {
    if (m === 'credit_card') return; // FR-5: disabled, not tappable — no processor connected.
    setSelectedMethod(m);
    setNote('');
    setScreen('confirm');
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
            disabled={isSaving}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Recording…' : 'Confirm Payment'}
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
              disabled={m.disabled}
              aria-disabled={m.disabled}
              data-testid={`payment-method-${m.id}`}
              className={`w-full flex items-center gap-4 px-4 py-4 transition-colors text-left ${
                m.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-muted/50 active:bg-muted/70'
              }`}
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
              {!m.disabled && (
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
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
