/**
 * Checkout Payment — choose how to collect the charge.
 * Inspired by Square's payment screen, using the app's design system.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { packages, clients, bookings, updateBooking } from '@/lib/mock-data';
import { getCart, clearCart } from '@/lib/cart-store';
import { X, Smartphone, Banknote, CreditCard, Link2, ChevronRight, Check, MoreHorizontal } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function computeTotal(cart: ReturnType<typeof getCart>): {
  subtotal: number; discount: number; total: number;
} {
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

// ── payment methods ───────────────────────────────────────────────────────────

const METHODS = [
  {
    id: 'tap',
    label: 'Tap to Pay',
    sub: 'iPhone NFC — no hardware needed',
    icon: Smartphone,
    featured: true,
  },
  { id: 'cash',   label: 'Cash',                    sub: null,            icon: Banknote,      featured: false },
  { id: 'card',   label: 'Manual Credit Card Entry', sub: null,            icon: CreditCard,    featured: false },
  { id: 'link',   label: 'Send Payment Link',        sub: 'Text or email', icon: Link2,         featured: false },
  { id: 'more',   label: 'More options',             sub: null,            icon: MoreHorizontal, featured: false },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function CheckoutPayment() {
  const [, setLocation] = useLocation();
  const cart = getCart();
  const { total } = computeTotal(cart);
  const client = clients.find(c => c.id === cart.clientId);
  const linkedBooking = cart.bookingId != null
    ? bookings.find(b => b.id === cart.bookingId) ?? null
    : null;
  const linkedClient = linkedBooking
    ? clients.find(c => c.id === linkedBooking.clientId) ?? null
    : null;

  const [paid, setPaid] = useState(false);
  const [paidMethod, setPaidMethod] = useState('');

  const handlePay = (label: string) => {
    // Mark the linked booking as completed before clearing the cart
    if (cart.bookingId != null) {
      updateBooking(cart.bookingId, { status: 'completed' });
    }
    setPaidMethod(label);
    setPaid(true);
    setTimeout(() => {
      clearCart();
      setLocation('/checkout');
    }, 2200);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (paid) {
    // Prefer the linked booking's client info if available
    const displayName = linkedClient?.name ?? client?.name;
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-24 h-24 rounded-full bg-[#1E9E62]/12 flex items-center justify-center mb-2">
          <div className="w-16 h-16 rounded-full bg-[#1E9E62]/20 flex items-center justify-center">
            <Check className="w-9 h-9 text-[#1E9E62]" strokeWidth={2.5} />
          </div>
        </div>
        <div>
          <p className="text-[26px] font-bold mb-1">Payment Received</p>
          <p className="text-[17px] text-muted-foreground tabular-nums">${total.toFixed(2)}</p>
          {displayName && (
            <p className="text-[15px] text-muted-foreground mt-1">{displayName}</p>
          )}
          {linkedBooking && (
            <p className="text-[14px] text-[#1E9E62] font-medium mt-1">
              Booking {linkedBooking.startTime} marked complete
            </p>
          )}
          <p className="text-[13px] text-muted-foreground mt-3 capitalize">{paidMethod}</p>
        </div>
        <p className="text-[13px] text-muted-foreground opacity-60 mt-4">
          Returning to checkout…
        </p>
      </div>
    );
  }

  // ── Payment method screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      {/* ── Header ── */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <button
          onClick={() => setLocation('/checkout/review')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
          aria-label="Back"
        >
          <X className="w-4 h-4" />
        </button>
        <button className="text-[15px] font-semibold underline underline-offset-2">
          Split Amount
        </button>
      </div>

      <div className="px-5">
        {/* ── Big amount ── */}
        <div className="pt-4 pb-6">
          <p className="text-[62px] font-black tracking-tight leading-none tabular-nums">
            ${total.toFixed(2)}
          </p>
          {client && (
            <p className="text-[16px] text-muted-foreground mt-2">{client.name}</p>
          )}
        </div>

        {/* ── Tap to Pay card (featured) ── */}
        <div className="rounded-2xl border border-border bg-muted/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <Smartphone className="w-6 h-6 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[16px] font-semibold mb-0.5">Tap to Pay on iPhone</p>
              <p className="text-[13px] text-muted-foreground mb-4">
                Accept contactless cards and Apple Pay — no reader needed.
              </p>
              <button
                onClick={() => handlePay('Tap to Pay')}
                className="w-full py-3 rounded-xl bg-background border border-border text-[15px] font-semibold hover:bg-muted transition-colors"
              >
                Enable Tap to Pay
              </button>
            </div>
          </div>
        </div>

        {/* ── Other methods ── */}
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border/50">
          {METHODS.filter(m => !m.featured).map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => handlePay(m.label)}
                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/50 active:bg-muted transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium">{m.label}</p>
                  {m.sub && (
                    <p className="text-[12px] text-muted-foreground">{m.sub}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
