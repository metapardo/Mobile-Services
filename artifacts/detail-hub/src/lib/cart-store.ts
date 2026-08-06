/**
 * In-memory cart store — same pattern as setup-store.
 * Cart state persists across navigation within a session.
 */

export interface CartItem {
  packageId: number;
  qty: number;
}

export interface CartState {
  items: CartItem[];
  clientId: number | null;
  discountPercent: number;
  tip: number;
}

let cart: CartState = {
  items: [],
  clientId: null,
  discountPercent: 0,
  tip: 0,
};

export function getCart(): CartState {
  return { ...cart, items: cart.items.map(i => ({ ...i })) };
}

export function addToCart(packageId: number): void {
  const existing = cart.items.find(i => i.packageId === packageId);
  if (existing) existing.qty += 1;
  else cart.items.push({ packageId, qty: 1 });
}

export function removeFromCart(packageId: number): void {
  cart.items = cart.items.filter(i => i.packageId !== packageId);
}

export function decrementCart(packageId: number): void {
  const existing = cart.items.find(i => i.packageId === packageId);
  if (!existing) return;
  if (existing.qty <= 1) removeFromCart(packageId);
  else existing.qty -= 1;
}

export function setCartClient(clientId: number | null): void {
  cart.clientId = clientId;
}

export function setCartDiscount(pct: number): void {
  cart.discountPercent = pct;
}

export function setCartTip(amount: number): void {
  cart.tip = amount;
}

export function replaceCart(items: CartItem[]): void {
  cart.items = items.map(i => ({ ...i }));
}

export function clearCart(): void {
  cart = { items: [], clientId: null, discountPercent: 0, tip: 0 };
}
