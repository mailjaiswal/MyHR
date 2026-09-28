/* Shift colouring.
 *
 * Each shift is shown in its OWN hue so a roster reads at a glance. The colour
 * comes from the shift's `color_code` stored in the DB (admin-editable); shifts
 * without a valid colour fall back to a curated multi-hue palette so neighbours
 * never collide. Overlap (two or more shifts on duty at once) gets its own
 * dedicated colour so handovers stand out from the shifts themselves.
 *
 * Hex values (not CSS vars) are used because several call sites concatenate an
 * alpha suffix / build rgba() tints, which var() cannot do.
 */

// Distinct, AA-friendly hues for shifts that have no colour_code set.
const FALLBACK_LIGHT = ['#047857', '#7c3aed', '#c2410c', '#0e7490', '#be123c', '#4d7c0f', '#1d4ed8'];
const FALLBACK_DARK = ['#6ee7b7', '#c4b5fd', '#fdba74', '#67e8f9', '#fda4af', '#bef264', '#93c5fd'];

// The overlap lane colour - deliberately NOT any of the shift hues above.
const OVERLAP_LIGHT = '#e11d48';   // rose-600
const OVERLAP_DARK = '#fda4af';    // rose-300

const isHex = (c) => typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());

/** Resolve a shift's display colour: its stored color_code, else a fallback hue. */
export function shiftColor(shift, index = 0, isDark = false) {
  if (isHex(shift?.color_code)) return shift.color_code.trim();
  const arr = isDark ? FALLBACK_DARK : FALLBACK_LIGHT;
  return arr[Math.abs(index) % arr.length];
}

/** Colour used to mark hours where 2+ shifts overlap. */
export const overlapColor = (isDark = false) => (isDark ? OVERLAP_DARK : OVERLAP_LIGHT);

/** Convert #rgb/#rrggbb to an rgba() string with the given alpha. */
export function withAlpha(hex, alpha) {
  if (!isHex(hex)) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
