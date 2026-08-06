import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import type { PaymentMethodId } from '@/lib/mock-data';

interface MethodConfig {
  label: string;
  bg: string;
  text: string;
  Icon?: React.ComponentType<{ className?: string }>;
  letter?: string;
}

const METHOD_CONFIG: Record<PaymentMethodId, MethodConfig> = {
  cash:  { label: 'Cash',  bg: 'bg-emerald-500/15', text: 'text-emerald-700', Icon: Banknote },
  zelle: { label: 'Zelle', bg: 'bg-violet-500/15',  text: 'text-violet-700',  letter: 'Z' },
  venmo: { label: 'Venmo', bg: 'bg-sky-500/15',     text: 'text-sky-700',     letter: 'V' },
  card:  { label: 'Card',  bg: 'bg-blue-500/15',    text: 'text-blue-700',    Icon: CreditCard },
  tap:   { label: 'Tap',   bg: 'bg-indigo-500/15',  text: 'text-indigo-700',  Icon: Smartphone },
};

interface PaymentMethodBadgeProps {
  method: PaymentMethodId;
  /** xs = calendar block; sm = booking detail */
  size?: 'xs' | 'sm';
}

export function PaymentMethodBadge({ method, size = 'sm' }: PaymentMethodBadgeProps) {
  const cfg = METHOD_CONFIG[method];
  if (!cfg) return null;
  const { Icon, letter, label, bg, text } = cfg;

  if (size === 'xs') {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1 py-[1px] rounded text-[9px] font-bold leading-tight ${bg} ${text}`}
      >
        {Icon
          ? <Icon className="w-2.5 h-2.5" />
          : letter
          ? <span className="text-[9px] font-black">{letter}</span>
          : null}
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${bg} ${text}`}
    >
      {Icon
        ? <Icon className="w-3 h-3" />
        : letter
        ? <span className="text-[11px] font-black leading-none">{letter}</span>
        : null}
      {label}
    </span>
  );
}
