import { BookingStatus } from '@/lib/mock-data';

interface StatusBadgeProps {
  status: BookingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'confirmed':
        return 'var(--status-green)';
      case 'pending':
        return 'var(--status-amber)';
      case 'cancelled':
      case 'no-show':
        return 'var(--status-red)';
      case 'completed':
        return 'hsl(var(--muted-foreground))';
    }
  };

  const color = getStatusColor(status);

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[13px] capitalize">{status}</span>
    </div>
  );
}
