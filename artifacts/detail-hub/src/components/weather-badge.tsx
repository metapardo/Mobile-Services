import { Cloud } from 'lucide-react';

interface WeatherBadgeProps {
  weather: string;
}

export function WeatherBadge({ weather }: WeatherBadgeProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[13px]">
      <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{weather}</span>
    </div>
  );
}
