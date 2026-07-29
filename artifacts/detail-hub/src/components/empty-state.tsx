import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
}

export function EmptyState({ icon: Icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 bg-muted rounded-xl">
      <Icon className="w-12 h-12 text-muted-foreground mb-3" />
      <p className="text-[15px] text-muted-foreground text-center">{message}</p>
    </div>
  );
}
