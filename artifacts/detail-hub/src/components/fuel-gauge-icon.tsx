/**
 * FuelGaugeIcon — small analog gauge SVG with tap-to-reveal breakdown dialog.
 *
 * Grades (per PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md §6.3):
 *   strong  → needle upper-right, green arc  ("Worth the trip")
 *   fair    → needle straight up, amber arc  ("Okay — watch the drive")
 *   weak    → needle upper-left, red arc     ("The drive eats this one")
 *   unknown → grey center dot + "?" text
 *
 * Clicking the icon stops event propagation (so calendar's Link doesn't
 * fire) and opens a Dialog with the underlying numbers. The SVG and its
 * grade→color mapping are unchanged from the pre-rework version — only the
 * inputs (now `FuelGaugeResult`'s real `grade`/dollar fields instead of the
 * old hash-derived `level`/`rate`) changed.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/blue-glass-design-system/components/ui/dialog';
import type { FuelGaugeResult, FuelGaugeGrade } from '@/lib/fuel-gauge';

// ── Gauge SVG ──────────────────────────────────────────────────────────────────
// viewBox 0 0 24 14 — semicircle with centre at (12, 14), radius 10
// Arc left→right: (2,14) → (12,4) → (22,14)
//   • 180° point: (2,14)
//   • 120° point: (7, 5.34)  ← one-third mark
//   •  90° point: (12, 4)    ← half mark (top)
//   •  60° point: (17, 5.34) ← two-thirds mark
//   •   0° point: (22, 14)

const NEEDLE: Record<FuelGaugeGrade, [number, number]> = {
  strong:  [20, 8],   // ≈ 30° from horizontal right  → upper-right
  fair:    [12, 4],   // 90° straight up
  weak:    [4,  8],   // ≈ 150° → upper-left
  unknown: [12, 4],   // centre-up (grey)
};

const GRADE_COLOR: Record<FuelGaugeGrade, string> = {
  strong:  '#1E9E62',
  fair:    '#D9A404',
  weak:    '#DC2626',
  unknown: '#9ca3af',
};

// Colored arc paths per grade (painted ON TOP of the grey background arc)
const ARC_PATH: Record<FuelGaugeGrade, string | null> = {
  // Left third: 180°→120°  M(2,14) → (7,5.34)
  weak:    'M2,14 A10,10 0 0 1 7,5.34',
  // Left half: 180°→90°    M(2,14) → (12,4)
  fair:    'M2,14 A10,10 0 0 1 12,4',
  // Full arc: 180°→0°      M(2,14) → (22,14)
  strong:  'M2,14 A10,10 0 0 1 22,14',
  unknown: null,
};

function GaugeSVG({ grade }: { grade: FuelGaugeGrade }) {
  const color = GRADE_COLOR[grade] ?? GRADE_COLOR.unknown;
  const [nx, ny] = NEEDLE[grade] ?? NEEDLE.unknown;
  const arcPath = ARC_PATH[grade];

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
      {grade !== 'unknown' && (
        <line
          x1="12" y1="14" x2={nx} y2={ny}
          stroke={color} strokeWidth="1.5" strokeLinecap="round"
        />
      )}
      {/* Pivot dot */}
      <circle cx="12" cy="14" r="2" fill={color} />
      {/* Unknown "?" label */}
      {grade === 'unknown' && (
        <text x="12" y="10" textAnchor="middle"
          fill="#9ca3af" fontSize="7" fontWeight="bold">?</text>
      )}
    </svg>
  );
}

// ── Label helpers ──────────────────────────────────────────────────────────────

function gradeLabel(grade: FuelGaugeGrade): string {
  return grade === 'strong' ? 'Worth the trip'
       : grade === 'fair'   ? 'Okay — watch the drive'
       : grade === 'weak'   ? 'The drive eats this one'
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

function unknownReasonCopy(result: FuelGaugeResult): string {
  switch (result.reason) {
    case 'no-address': return 'This booking has no selected address yet.';
    case 'no-price': return 'This booking has no priced service — a free job isn’t scored.';
    case 'no-hq': return 'Set your shop address in Settings to score jobs.';
    case 'no-anchor': return 'No nearby job or Home Base address to measure from.';
    case 'routing-failed': return 'Couldn’t get drive time for this booking.';
    case 'not-computed': return 'Not scored yet — open this booking to see its Fuel Gauge reading.';
    default: return 'Not enough information to score this booking yet.';
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FuelGaugeIconProps {
  result: FuelGaugeResult;
  clientName?: string;
}

export function FuelGaugeIcon({ result, clientName }: FuelGaugeIconProps) {
  const [open, setOpen] = useState(false);

  const color = GRADE_COLOR[result.grade] ?? GRADE_COLOR.unknown;
  const isKnown = result.grade !== 'unknown';
  // OBS-1 (`BUGS_Mobull_2026-09-10.md`) — round once, at the one-way figure,
  // then derive the round-trip display from that already-rounded value
  // (doubled) rather than independently rounding `result.roundTripMinutes`
  // a second time. Keeps this dialog's round-trip minutes consistent with
  // `booking-new.tsx`'s inline gauge row, which does the same derivation.
  const roundTripMinutesDisplay = Math.round(result.roundTripMinutes / 2) * 2;

  return (
    <>
      {/* BUG-4 (`BUGS_Mobull_2026-09-10.md`) — explicit small, fixed tap
          target (not `shrink-0` alone, which only stops the button from
          shrinking, never from being a large fraction of a short card's
          corner). `w-6 h-6` with a little internal padding keeps the hit
          area to roughly the glyph itself, so the card's own `Link` — the
          dominant surface — wins an ordinary tap anywhere else on the card,
          even at the shortest card height the calendar renders. */}
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="shrink-0 w-6 h-6 p-0.5 flex items-center justify-center rounded-md hover:opacity-80 active:opacity-60 transition-opacity"
        aria-label={`Fuel gauge: ${result.grade}`}
        data-testid="fuel-gauge-icon"
      >
        <GaugeSVG grade={result.grade} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <GaugeSVG grade={result.grade} />
              {/* BUG-4: renamed from "Fuel Gauge · {clientName}" — a title
                  led with the client's name read as "the client's profile
                  popped up" when the icon was tapped unintentionally. */}
              <span>Trip cost{clientName ? ` · ${clientName}` : ''}</span>
            </DialogTitle>
          </DialogHeader>

          {isKnown ? (
            <>
              {/* Money-first headline, per §8.1 */}
              <div
                className="mt-1 px-4 py-3 rounded-xl"
                style={{ backgroundColor: `${color}18`, color }}
              >
                <p className="text-[18px] font-bold tabular-nums">
                  You keep ${result.youKeep.toFixed(0)} of ${result.servicePrice.toFixed(0)}
                </p>
                <p className="text-[13px] font-semibold mt-0.5">{gradeLabel(result.grade)}</p>
              </div>

              {/* Two separate cost lines — never collapsed (FR-23a) */}
              <div className="space-y-2.5 mt-3">
                <div className="flex items-start justify-between gap-3 text-[14px]">
                  <span className="text-muted-foreground">Fuel</span>
                  <span className="font-medium tabular-nums text-right">
                    ${result.fuelCost.toFixed(2)} · {result.roundTripMiles.toFixed(1)} mi round trip
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 text-[14px]">
                  <span className="text-muted-foreground">Drive time</span>
                  <span className="font-medium tabular-nums text-right">
                    ${result.driveCost.toFixed(2)} · {roundTripMinutesDisplay} min round trip
                  </span>
                </div>
                {result.anchorAddress && (
                  <div className="flex items-start justify-between gap-3 text-[14px]">
                    <span className="text-muted-foreground">Anchor</span>
                    <span className="font-medium text-right">{fmtAddr(result.anchorAddress)}</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 text-[14px]">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium text-right">{anchorLabel(result.anchorType)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                className="mt-1 px-4 py-3 rounded-xl text-[14px] font-semibold"
                style={{ backgroundColor: `${color}18`, color }}
              >
                {gradeLabel(result.grade)}
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">
                {unknownReasonCopy(result)}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
