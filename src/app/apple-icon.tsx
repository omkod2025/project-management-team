import { ImageResponse } from 'next/og';

/**
 * The same mark as `icon.svg`, at home-screen size.
 *
 * Generated rather than committed as a binary, because the geometry is the
 * design system's arithmetic and should stay readable in the diff: if the red
 * ever stops being the overhang, that is a change someone should have to write
 * down.
 *
 * `apple-icon` cannot be an SVG file (Next accepts only jpg/png there), so this
 * draws the same rectangles as divs. Every value is the `icon.svg` 32-unit grid
 * scaled by 180/32 — one mark, one set of proportions.
 *
 * The one deliberate difference from `icon.svg`: the ground is square and bled
 * to the edge rather than carrying the 9-unit radius, because iOS masks the
 * corners itself and a rounded ground inside that mask reads as a second,
 * smaller tile.
 *
 * The colours and the reasoning behind them — why indigo is the ground and not
 * the bar, and why the red is `#E5654E` — are documented in `icon.svg`.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The 32-unit grid of `icon.svg`, in device pixels at 180. */
const u = (n: number) => n * (180 / 32);

/** `.sh-seg`'s 1px, on this grid. Not a capsule. */
const r = u(1.5);

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          // The auth field's indigo. iOS rounds this square itself.
          background: '#2B3A8F',
          paddingLeft: u(6),
        }}
      >
        <div style={{ display: 'flex', width: u(20), height: u(6) }}>
          {/* the run, as far as the plan went */}
          <div style={{ width: u(15), height: '100%', background: '#FFFFFF', borderRadius: `${r}px 0 0 ${r}px` }} />
          {/* the misclosure: past the plan, and the only red permitted */}
          <div style={{ width: u(5), height: '100%', background: '#E5654E', borderRadius: `0 ${r}px ${r}px 0` }} />
        </div>
      </div>
    ),
    size,
  );
}
