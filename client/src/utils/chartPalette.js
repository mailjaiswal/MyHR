/* Single-hue categorical ramp.
 *
 * Data-viz best practice for a product with one brand colour: distinguish
 * series by *strength*, not by hue. The light and dark lists are ordered so
 * neighbouring steps stay visibly different AND every value clears AA when
 * used as small text on that theme's card surface (white / #121620).
 *
 * Values are hex rather than CSS vars because several charts concatenate an
 * alpha suffix (`${color}20`) - var() cannot be concatenated.
 */
const LIGHT = ['#0d9488', '#047857', '#10b981', '#34d399', '#065f46', '#6ee7b7', '#115e59'];
const DARK = ['#34d399', '#6ee7b7', '#2dd4bf', '#a7f3d0', '#5eead4', '#10b981', '#99f6e4'];

/** Palette for the current theme. */
export const ramp = (isDark) => (isDark ? DARK : LIGHT);

/** Wrapped ramp lookup, so a caller can pass any index safely. */
export const rampAt = (index, isDark) => {
  const steps = ramp(isDark);
  return steps[Math.abs(index) % steps.length];
};
