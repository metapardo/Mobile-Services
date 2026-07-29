import { GasMeter } from '@/lib/mock-data';
import { Fuel } from 'lucide-react';

interface GasMeterBadgeProps {
  gasMeter: GasMeter;
  onClick?: () => void;
}

export function GasMeterBadge({ gasMeter, onClick }: GasMeterBadgeProps) {
  const getColor = (status: string) => {
    switch (status) {
      case 'green':
        return 'var(--status-green)';
      case 'amber':
        return 'var(--status-amber)';
      case 'red':
        return 'var(--status-red)';
      default:
        return 'var(--status-green)';
    }
  };

  const color = getColor(gasMeter.status);

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[13px] hover:bg-muted transition-colors"
      data-testid="gas-meter-badge"
    >
      <Fuel className="w-3.5 h-3.5" style={{ color }} />
      <span>{gasMeter.distanceMiles}mi</span>
      <span style={{ color }} className="font-medium tabular-nums">
        ${gasMeter.gasCost.toFixed(2)}
      </span>
    </button>
  );
}
