import { useLayoutEffect, useState } from 'react';

// Popovers in this app are absolutely positioned against their trigger button
// (`right: 0` or `left: 0`). When the trigger sits inside a narrow pane, a
// fixed-width menu can end up hanging off the viewport — measured in the field
// at 101px past the left edge for the Export menu. This hook measures the
// overlap and nudges the menu back on screen with a margin, leaving `transform`
// free for the entry animation.

const EDGE = 8;

export default function useClampedPopover(anchorRef, open, side = 'right') {
  const [clamp, setClamp] = useState({ offset: 0, flip: false });

  useLayoutEffect(() => {
    if (!open) { setClamp({ offset: 0, flip: false }); return undefined; }
    const anchor = anchorRef.current;
    if (!anchor) return undefined;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const menu = anchor.querySelector('.crp-popover');
        if (!menu) return;
        const a = anchor.getBoundingClientRect();
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        let offset = 0;
        if (side === 'right') {
          const moveLeft = Math.max(0, a.right - (vw - EDGE));
          const moveRight = Math.max(0, EDGE - (a.right - w));
          offset = moveLeft - moveRight; // marginRight: + moves the menu left
        } else {
          offset = -Math.max(0, a.left + w - (vw - EDGE)); // marginLeft: - moves it left
        }
        // Open upward when it cannot fit below but there is room above, instead
        // of dangling past the fold on short windows.
        const flip = a.bottom + EDGE + h > vh && a.top - EDGE - h >= 0;
        setClamp(prev => (prev.offset === offset && prev.flip === flip ? prev : { offset, flip }));
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorRef, open, side]);

  const flipStyle = clamp.flip ? { top: 'auto', bottom: 'calc(100% + 0.5rem)' } : null;
  return side === 'right'
    ? { marginRight: clamp.offset, ...flipStyle }
    : { marginLeft: clamp.offset, ...flipStyle };
}

/**
 * Same idea for a popover that IS the measured element (no trigger wrapper to
 * measure against). The applied margin is subtracted before recomputing, so the
 * value converges in one step and re-measuring on scroll/resize stays stable.
 */
export function useClampedSelfPopover(ref, active = true) {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vw = document.documentElement.clientWidth;
        const baseRight = el.getBoundingClientRect().right - offset;
        setOffset(prev => {
          const overflow = baseRight - (vw - EDGE);
          const next = overflow > 0 ? -overflow : 0;
          return next === prev ? prev : next;
        });
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [ref, active, offset]);

  return { marginLeft: offset };
}
