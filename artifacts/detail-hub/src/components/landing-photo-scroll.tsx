import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PhotoColumnProps {
  photos: string[];
  duration: number;
  className?: string;
}

/**
 * One vertically-scrolling strip of photos. The photo list is rendered twice
 * back-to-back and the whole strip is animated from y: 0% to y: -50% on an
 * infinite linear loop — since the second copy is identical to the first,
 * the loop point is invisible and the motion reads as continuous, not a
 * stack that resets.
 */
function PhotoColumn({ photos, duration, className }: PhotoColumnProps) {
  return (
    <div className={cn('relative h-full overflow-hidden', className)}>
      <motion.div
        className="flex flex-col gap-4"
        animate={{ y: ['0%', '-50%'] }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      >
        {[...photos, ...photos].map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            aria-hidden="true"
            className="w-full h-[300px] rounded-2xl object-cover shadow-lg"
            loading={i < photos.length ? 'eager' : 'lazy'}
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
 */
export function LandingPhotoScroll({ photos }: { photos: string[] }) {
  // Interleave the (small, curated) photo set into two columns so the two
  // strips don't show the exact same sequence side by side.
  const colA = photos.filter((_, i) => i % 2 === 0);
  const colB = photos.filter((_, i) => i % 2 === 1);

  return (
    <div className="hidden lg:grid grid-cols-2 gap-4 h-[130%] -translate-y-[15%]">
      <PhotoColumn photos={colA.length ? colA : photos} duration={42} />
      <PhotoColumn photos={colB.length ? colB : photos} duration={54} className="mt-20" />
    </div>
  );
}
