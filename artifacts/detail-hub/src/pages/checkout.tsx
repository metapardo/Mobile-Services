/**
 * Checkout — POS Library screen.
 * Browse & add services to a cart, then tap "Review Sale" to proceed.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { packages } from '@/lib/mock-data';
import { replaceCart } from '@/lib/cart-store';
import { Search, Plus, Minus } from 'lucide-react';

export default function Checkout() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [cartItems, setCartItems] = useState<{ packageId: number; qty: number }[]>([]);

  const filtered = packages.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase()),
  );

  const getQty = (id: number) => cartItems.find(i => i.packageId === id)?.qty ?? 0;

  const inc = (id: number) =>
    setCartItems(prev => {
      const found = prev.find(i => i.packageId === id);
      if (found) return prev.map(i => i.packageId === id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { packageId: id, qty: 1 }];
    });

  const dec = (id: number) =>
    setCartItems(prev => {
      const found = prev.find(i => i.packageId === id);
      if (!found) return prev;
      if (found.qty <= 1) return prev.filter(i => i.packageId !== id);
      return prev.map(i => i.packageId === id ? { ...i, qty: i.qty - 1 } : i);
    });

  const totalItems = cartItems.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cartItems.reduce((s, i) => {
    const pkg = packages.find(p => p.id === i.packageId);
    return s + (pkg?.price ?? 0) * i.qty;
  }, 0);

  const handleReview = () => {
    replaceCart(cartItems);
    setLocation('/checkout/review');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-48 md:pb-24">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 pt-5 pb-3">
        <h1 className="text-[22px] font-bold mb-3">Checkout</h1>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground/60 focus:outline-none"
            placeholder="Search services…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Package list ── */}
      <div className="divide-y divide-border/30">
        {filtered.map(pkg => {
          const qty = getQty(pkg.id);
          const initials = pkg.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div key={pkg.id} className="flex items-center px-4 py-3.5 gap-3">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[12px] font-bold text-primary">{initials}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium truncate">{pkg.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  ${pkg.price} · {pkg.durationMinutes} min
                </p>
              </div>

              {/* Qty control */}
              {qty === 0 ? (
                <button
                  onClick={() => inc(pkg.id)}
                  className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shrink-0 active:scale-95 transition-transform"
                  aria-label={`Add ${pkg.name}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => dec(pkg.id)}
                    className="w-9 h-9 rounded-full border border-border flex items-center justify-center active:bg-muted transition-colors"
                    aria-label="Remove one"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[16px] font-semibold w-5 text-center tabular-nums">
                    {qty}
                  </span>
                  <button
                    onClick={() => inc(pkg.id)}
                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white active:scale-95 transition-transform"
                    aria-label="Add one more"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Review Sale bar ── */}
      {totalItems > 0 && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-md border-t border-border/40 px-5 py-4">
          <button
            onClick={handleReview}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold gradient-btn text-white flex items-center justify-between px-5"
          >
            <span>Review Sale</span>
            <span className="flex items-center gap-2">
              <span className="bg-white/25 text-[13px] font-semibold px-2.5 py-0.5 rounded-full">
                {totalItems} item{totalItems !== 1 ? 's' : ''}
              </span>
              <span className="tabular-nums">${totalPrice.toFixed(2)}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
