/**
 * FuelGaugeIcon — small analog gauge SVG with tap-to-reveal breakdown dialog.
 *
 * Levels:
 *   full  → needle upper-right, green arc
 *   half  → needle straight up, amber arc (left half)
 *   empty → needle upper-left, red arc (left third)
 *   unknown → grey center dot + "?" text
 *
 * Clicking the icon stops event propagation (so calendar Link doesn't fire)
 * and opens a Dialog with the underlying numbers.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FuelGaugeResult } from '@/lib/fuel-gauge';

// ── Gauge SVG ──────────────────────────────────────────────────────────────────
// viewBox 0 0 24 14 — semicircle with centre at (12, 14), radius 10
// Arc left→right: (2,14) → (12,4) → (22,14)
//   • 180° point: (2,14)
//   • 120° point: (7, 5.34)  ← one-third mark
//   •  90° point: (12, 4)    ← half mark (top)
//   •  60° point: (17, 5.34) ← two-thirds mark
//   •   0° point: (22, 14)

const NEEDLE: Record<string, [number, number]> = {
  full:    [20, 8],   // ≈ 30° from horizontal right  → upper-right
  half:    [12, 4],   // 90° straight up
  empty:   [4,  8],   // ≈ 150° → upper-left
  unknown: [12, 4],   // centre-up (grey)
};

const LEVEL_COLOR: Record<string, string> = {
  full:    '#1E9E62',
  half:    '#D9A404',
  empty:   '#DC2626',
  unknown: '#9ca3af',
};

// Colored arc paths per level (painted ON TOP of the grey background arc)
const ARC_PATH: Record<string, string | null> = {
  // Left third: 180°→120°  M(2,14) → (7,5.34)
  empty:   'M2,14 A10,10 0 0 1 7,5.34',
  // Left half: 180°→90°    M(2,14) → (12,4)
  half:    'M2,14 A10,10 0 0 1 12,4',
  // Full arc: 180°→0°      M(2,14) → (22,14)
  full:    'M2,14 A10,10 0 0 1 22,14',
  unknown: null,
};

function GaugeSVG({ level }: { level: string }) {
  const color = LEVEL_COLOR[level] ?? LEVEL_COLOR.unknown;
  const [nx, ny] = NEEDLE[level] ?? NEEDLE.unknown;
  const arcPath = ARC_PATH[level];

  return (
    <svg width="24" height="14" viewBox="0 0 24 14" aria-hidden="true">
      {/* Background arc — always full grey */}
      <path
        d="M2,14 A10,10 0 0 1 22,14"
        fill="none" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round"
      />
      {/* Colored filled arc */}
      {arcPath && (
        <path
          d={arcPath}
          fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        />
      )}
      {/* Needle */}
      {level !== 'unknown' && (
        <line
          x1="12" y1="14" x2={nx} y2={ny}
          stroke={color} strokeWidth="1.5" strokeLinecap="round"
        />
      )}
      {/* Pivot dot */}
      <circle cx="12" cy="14" r="2" fill={color} />
      {/* Unknown "?" label */}
      {level === 'unknown' && (
        <text x="12" y="10" textAnchor="middle"
          fill="#9ca3af" fontSize="7" fontWeight="bold">?</text>
      )}
    </svg>
  );
}

// ── Label helpers ──────────────────────────────────────────────────────────────

function levelLabel(level: string): string {
  return level === 'full' ? 'Full — great ROI'
       : level === 'half' ? 'Half — acceptable ROI'
       : level === 'empty' ? 'Empty — low ROI'
       : 'Unknown';
}

function anchorLabel(type: FuelGaugeResult['anchorType']): string {
  return type === 'home'     ? 'Home base (no other jobs that day)'
       : type === 'adjacent' ? 'Only other job that day'
       : 'Nearest job that day';
}

function fmtAddr(addr: string): string {
  // Shorten to first two comma-separated parts
  return addr.split(',').slice(0, 2).join(',').trim();
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FuelGaugeIconProps {
  result: FuelGaugeResult;
  clientName?: string;
}

export function FuelGaugeIcon({ result, clientName }: FuelGaugeIconProps) {
  const [open, setOpen] = useState(false);

  const color = LEVEL_COLOR[result.level] ?? LEVEL_COLOR.unknown;
  const isKnown = result.level !== 'unknown';

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="shrink-0 flex items-center justify-center rounded-md hover:opacity-80 active:opacity-60 transition-opacity"
        style={{ lineHeight: 0 }}
        aria-label={`Fuel gauge: ${result.level}`}
        data-testid="fuel-gauge-icon"
      >
        <GaugeSVG level={result.level} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <GaugeSVG level={result.level} />
              <span>Fuel Gauge{clientName ? ` · ${clientName}` : ''}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Level callout */}
          <div
            className="mt-1 px-4 py-3 rounded-xl text-[14px] font-semibold"
            style={{
              backgroundColor: `${color}18`,
              color,
            }}
          >
            {levelLabel(result.level)}
          </div>

          {/* Numbers */}
          <div className="space-y-2.5 mt-3">
            {[
              ['Booking price',   `$${result.bookingPrice.toFixed(2)}`],
              isKnown && result.metricType === 'miles'
                ? ['Drive distance', `${result.metricValue.toFixed(1)} mi`]
                : isKnown
                  ? ['Drive time', `${result.metricValue} min`]
                  : null,
              isKnown
                ? ['Rate',
                    result.metricType === 'miles'
                      ? `$${result.rate.toFixed(2)}/mi`
                      : `$${result.rate.toFixed(2)}/min`]
                : null,
              result.anchorAddress
                ? ['Anchor', fmtAddr(result.anchorAddress)]
                : null,
              result.anchorAddress
                ? ['Anchor type', anchorLabel(result.anchorType)]
                : null,
            ]
              .filter(Boolean)
              .map(([label, value]) => (
                <div key={label as string} className="flex items-start justify-between gap-3 text-[14px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums text-right">{value}</span>
                </div>
              ))}
          </div>

          {!isKnown && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Rate cannot be calculated — the booking has no address or a $0 price.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
