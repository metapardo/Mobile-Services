import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Fixed pixel heights (not aspect-ratio-driven) so the "does one strip-copy
 * exceed the container's height" arithmetic in `LandingPhotoScroll` below
 * holds regardless of the column's *rendered width* at a given breakpoint —
 * only the viewport's *height* (via `h-dvh` on the page shell) affects the
 * container height these need to clear. See the exact math in the comment
 * on `LandingPhotoScroll`.
 */
const SQUARE_TILE_HEIGHT = 380;
const VERTICAL_TILE_HEIGHT = 560;
const TILE_GAP = 16; // gap-4

export interface PhotoTile {
  src: string;
  shape: 'square' | 'vertical';
}

interface PhotoColumnProps {
  tiles: PhotoTile[];
  duration: number;
  className?: string;
}

/**
 * One vertically-scrolling strip of photo tiles. The tile list is rendered
 * twice back-to-back and the whole strip is animated from y: 0% to y: -50%
 * on an infinite linear loop — since the second copy is identical to the
 * first, the loop point is invisible and the motion reads as continuous,
 * not a stack that resets.
 *
 * That trick only works if ONE copy of the strip is taller than the
 * container clipping it — otherwise the strip runs out of content before
 * the loop resets and there's a visible blank gap. Callers are responsible
 * for passing a `tiles` list whose summed height (see `TILE_GAP` /
 * `SQUARE_TILE_HEIGHT` / `VERTICAL_TILE_HEIGHT`) clears the container; see
 * `LandingPhotoScroll` for the actual math.
 */
function PhotoColumn({ tiles, duration, className }: PhotoColumnProps) {
  return (
    <div className={cn('relative h-full overflow-hidden', className)}>
      <motion.div
        className="flex flex-col gap-4"
        animate={{ y: ['0%', '-50%'] }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      >
        {[...tiles, ...tiles].map((tile, i) => (
          <img
            key={i}
            src={tile.src}
            alt=""
            aria-hidden="true"
            className="w-full object-cover shadow-lg rounded-none"
            style={{ height: tile.shape === 'square' ? SQUARE_TILE_HEIGHT : VERTICAL_TILE_HEIGHT }}
            loading={i < tiles.length ? 'eager' : 'lazy'}
          />
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Right-column "photos to scroll" collage for the signup split-screen layout —
 * real mobile-detailing job photos in two offset columns, auto-scrolling
 * vertically forever rather than sitting as a static stack, and bleeding off
 * the top/bottom edges of the viewport by design (the container clips a
 * strip that's taller than it is, so frames are never neatly cropped to
 * fit — see PhotoColumn above for how the loop itself works).
 *
 * Deliberately desktop-only (`hidden lg:grid`): on narrow viewports there's
 * no room for a second column without crowding the actual form, and a
 * constantly-animating full-bleed image wall is exactly the kind of thing
 * that hurts mobile scroll performance for no real benefit.
 *
 * --- Seamless-loop math (avoids the "visible void" bug) ---
 * This component's parent (`SignupLayout`'s right-hand grid cell) is
 * `h-dvh` at the `lg` breakpoint where this renders, so the wrapper below
 * (`h-[130%]`) resolves to `1.3 * viewportHeight`, and each `PhotoColumn`
 * stretches to that same row height (CSS grid `align-items: stretch`).
 * For the loop to look seamless, ONE copy of each column's tile strip must
 * be taller than that — with real headroom, since viewport heights vary.
 *
 * With all 9 approved source photos in play (see `signup.tsx`'s
 * `LANDING_PHOTO_COLUMNS`), each column gets 9 tiles (8 gaps @ 16px):
 *
 *   colA: 5 square (380px) + 4 vertical (560px) + 8 gaps (16px) = 4268px
 *   colB: 4 square (380px) + 5 vertical (560px) + 8 gaps (16px) = 4448px
 *
 * Required container height even at a tall 1200px-viewport desktop window
 * is only 1.3 * 1200 = 1560px, so both columns clear it with 2.7x+
 * headroom — comfortably safe across realistic desktop viewport heights,
 * not just the specific ones spot-checked in manual QA.
 *
 * Durations are picked to hold the same per-column px/s speed (and the
 * same ~1.3:1 colA:colB ratio) as the previous 5-photo set, rather than
 * reusing its duration values verbatim now that the strips are longer —
 * otherwise adding photos would silently speed up the animation:
 *
 *   colA: 4268px / 184s = 23.20 px/s
 *   colB: 4448px / 249s = 17.86 px/s   (ratio: 1.30)
 */
export function LandingPhotoScroll({ tiles }: { tiles: [PhotoTile[], PhotoTile[]] }) {
  const [colA, colB] = tiles;

  return (
    <div className="hidden lg:grid grid-cols-2 gap-4 h-[130%] -translate-y-[15%]">
      <PhotoColumn tiles={colA} duration={184} />
      <PhotoColumn tiles={colB} duration={249} className="mt-20" />
    </div>
  );
}
