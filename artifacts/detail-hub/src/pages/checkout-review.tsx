/**
 * Checkout Review — "Current Sale" screen.
 * Customer, line items, discount, tip → "Charge $X"
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { packages, clients } from '@/lib/mock-data';
import { getCart, setCartClient, setCartDiscount, setCartTip } from '@/lib/cart-store';
import { X, ChevronRight, UserPlus, Percent, Plus, Trash2, HandCoins } from 'lucide-react';

export default function CheckoutReview() {
  const [, setLocation] = useLocation();
  const initial = getCart();

  // Consolidate repeated package ids → {packageId, qty}
  const consolidate = (items: typeof initial.items) =>
    items.reduce((acc, item) => {
      const found = acc.find(i => i.packageId === item.packageId);
      if (found) found.qty += 1;
      else acc.push({ packageId: item.packageId, qty: 1 });
      return acc;
    }, [] as { packageId: number; qty: number }[]);

  const [lineItems, setLineItems] = useState(consolidate(initial.items));
  const [clientId, setClientId] = useState<number | null>(initial.clientId);
  const [discountPct, setDiscountPct] = useState(initial.discountPercent);
  const [tip, setTip] = useState(initial.tip);
  const [showDiscount, setShowDiscount] = useState(initial.discountPercent > 0);
  const [showTip, setShowTip] = useState(initial.tip > 0);
  const [tipMode, setTipMode] = useState<'preset' | 'custom'>(initial.tip > 0 ? 'preset' : 'preset');
  const [customTipStr, setCustomTipStr] = useState('');
  const [showClientSheet, setShowClientSheet] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const subtotal = lineItems.reduce((s, i) => {
    const pkg = packages.find(p => p.id === i.packageId);
    return s + (pkg?.price ?? 0) * i.qty;
  }, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const total = subtotal - discountAmt + tip;

  const client = clients.find(c => c.id === clientId);
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()),
  );

  const removeItem = (packageId: number) =>
    setLineItems(prev => prev.filter(i => i.packageId !== packageId));

  const handleCharge = () => {
    setCartClient(clientId);
    setCartDiscount(discountPct);
    setCartTip(tip);
    setLocation('/checkout/payment');
  };

  const totalItemCount = lineItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="min-h-[100dvh] bg-background pb-48 md:pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3 flex items-center">
        <button
          onClick={() => setLocation('/checkout')}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-muted shrink-0"
          aria-label="Back"
        >
          <X className="w-4 h-4" />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">
          Current Sale ({totalItemCount})
        </h1>
        <div className="w-8 shrink-0" />
      </div>

      <div className="max-w-2xl mx-auto px-4">
        {/* ── Customer ── */}
        <button
          onClick={() => setShowClientSheet(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted mt-4 mb-4"
        >
          <UserPlus className="w-5 h-5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left text-[15px]">
            {client
              ? <span className="font-medium">{client.name}</span>
              : <span className="text-muted-foreground">Add a customer</span>}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* ── Line items ── */}
        <div className="border border-border rounded-2xl overflow-hidden mb-4">
          {lineItems.map(({ packageId, qty }, idx) => {
            const pkg = packages.find(p => p.id === packageId);
            if (!pkg) return null;
            return (
              <div
                key={packageId}
                className={`flex items-center gap-3 px-4 py-3.5 ${idx < lineItems.length - 1 ? 'border-b border-border/50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate">
                    {qty > 1 && <span className="text-muted-foreground mr-1">{qty}×</span>}
                    {pkg.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{pkg.durationMinutes} min</p>
                </div>
                <span className="text-[15px] font-medium tabular-nums shrink-0">
                  ${(pkg.price * qty).toFixed(2)}
                </span>
                <button
                  onClick={() => removeItem(packageId)}
                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  aria-label={`Remove ${pkg.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {lineItems.length === 0 && (
            <p className="px-4 py-6 text-center text-[14px] text-muted-foreground">
              No items — go back to add services
            </p>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="border border-border rounded-2xl overflow-hidden mb-4 divide-y divide-border/50">
          {/* Discount */}
          <button
            onClick={() => setShowDiscount(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <Percent className="w-4 h-4 text-muted-foreground" />
              Add discount
            </span>
            {discountPct > 0
              ? <span className="text-[15px] text-primary font-medium">−{discountPct}%</span>
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showDiscount && (
            <div className="px-4 py-3 bg-muted/30 flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="100"
                value={discountPct || ''}
                onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                placeholder="0"
                className="w-20 px-3 py-2 rounded-xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary tabular-nums"
              />
              <span className="text-[15px] text-muted-foreground">% off</span>
              {discountPct > 0 && (
                <span className="text-[13px] text-primary ml-auto font-medium">
                  −${discountAmt.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Tip */}
          <button
            onClick={() => setShowTip(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <HandCoins className="w-4 h-4 text-muted-foreground" />
              Add tip
            </span>
            {tip > 0
              ? <span className="text-[15px] text-primary font-medium">+${tip.toFixed(2)}</span>
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showTip && (
            <div className="px-4 py-3 bg-muted/30 space-y-3">
              {/* Preset percentage buttons */}
              <div className="flex gap-2">
                {[10, 15, 20, 25].map(pct => {
                  const amt = parseFloat(((subtotal * pct) / 100).toFixed(2));
                  const isActive = tipMode === 'preset' && tip === amt;
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        setTipMode('preset');
                        setTip(amt);
                        setCustomTipStr('');
                      }}
                      className={`flex-1 py-2 rounded-xl border text-[13px] font-semibold transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setTipMode('custom');
                    setTip(0);
                    setCustomTipStr('');
                  }}
                  className={`flex-1 py-2 rounded-xl border text-[13px] font-semibold transition-colors ${
                    tipMode === 'custom'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Custom amount input */}
              {tipMode === 'custom' && (
                <div className="flex items-center gap-2">
                  <span className="text-[15px] text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customTipStr}
                    onChange={e => {
                      setCustomTipStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      setTip(isNaN(val) || val < 0 ? 0 : parseFloat(val.toFixed(2)));
                    }}
                    placeholder="0.00"
                    className="w-28 px-3 py-2 rounded-xl border border-border bg-background text-[15px] focus:outline-none focus:border-primary tabular-nums"
                    autoFocus
                  />
                </div>
              )}

              {/* No tip */}
              <button
                onClick={() => {
                  setTip(0);
                  setTipMode('preset');
                  setCustomTipStr('');
                }}
                className="text-[13px] text-muted-foreground underline underline-offset-2"
              >
                No tip
              </button>
            </div>
          )}

          {/* Add item */}
          <button
            onClick={() => setLocation('/checkout')}
            className="w-full flex items-center gap-2 px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
            <span className="text-[15px] font-medium">Add item or service</span>
          </button>
        </div>

        {/* ── Totals ── */}
        <div className="space-y-2 px-1 mb-2">
          <div className="flex justify-between text-[15px]">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">${subtotal.toFixed(2)}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-[15px]">
              <span className="text-muted-foreground">Discount ({discountPct}%)</span>
              <span className="text-[#1E9E62] tabular-nums">−${discountAmt.toFixed(2)}</span>
            </div>
          )}
          {tip > 0 && (
            <div className="flex justify-between text-[15px]">
              <span className="text-muted-foreground">Tip</span>
              <span className="tabular-nums">${tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[18px] font-bold pt-3 border-t border-border">
            <span>Total</span>
            <span className="tabular-nums">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ── Charge button ── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-md border-t border-border/40 px-5 py-4">
        <button
          onClick={handleCharge}
          disabled={lineItems.length === 0}
          className={`w-full py-4 rounded-2xl text-[17px] font-semibold transition-all ${
            lineItems.length > 0
              ? 'gradient-btn text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          Charge ${total.toFixed(2)}
        </button>
      </div>

      {/* ── Client picker sheet ── */}
      {showClientSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowClientSheet(false)}
          />
          <div className="relative bg-background rounded-t-3xl max-h-[75dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
              <h2 className="text-[17px] font-semibold">Select customer</h2>
              <button
                onClick={() => setShowClientSheet(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
                <input
                  className="flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground/60 focus:outline-none"
                  placeholder="Search…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setClientId(c.id); setShowClientSheet(false); setClientSearch(''); }}
                  className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors ${clientId === c.id ? 'text-primary' : ''}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[13px] font-bold text-primary">{c.name.charAt(0)}</span>
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{c.name}</p>
                    <p className="text-[12px] text-muted-foreground">{c.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
