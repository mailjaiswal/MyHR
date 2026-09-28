import { useEffect } from 'react';

/* Cards that should answer to the cursor. Keep this list tiny - the effect runs
   on every mousemove, so each extra selector costs hit-testing on real hardware. */
const SELECTOR = '.swaniki-card, .section-card';

/**
 * Writes --mx / --my (pointer position relative to the card) onto the card under
 * the cursor, which the spotlight ring in index.css reads. One delegated
 * listener for the whole app, coalesced into animation frames.
 *
 * Skipped entirely on touch/coarse pointers, where a "hover" glow has no meaning.
 */
export default function useSpotlight(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    let frame = 0;
    let pending = null;

    const apply = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${x - rect.left}px`);
      el.style.setProperty('--my', `${y - rect.top}px`);
      pending = null;
    };

    const onMove = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(SELECTOR);
      if (!el) return;
      pending = { el, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);
}
