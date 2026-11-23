/**
 * The demo skin's edge: the blue field dissolving into the page through an 8x8 Bayer dither at 2px cells, as
 * on baileymeyers.com. Static SVG patterns, never animated. "down" fades the field into the page below it,
 * "up" fades the page into the field below it (above the footer). `id` keeps two fades' patterns apart.
 */

const CELL = 2;
// [tile size, filled 2px cells as [x, y, width, height]], from densest to lightest.
const STEPS: Array<[number, Array<[number, number, number, number]>]> = [
  [8, [[0, 0, 8, 2], [0, 2, 4, 2], [6, 2, 2, 2], [0, 4, 8, 2], [2, 6, 6, 2]]], // 88%
  [4, [[0, 0, CELL, CELL], [2, 0, CELL, CELL], [2, 2, CELL, CELL]]], // 75%
  [4, [[0, 0, CELL, CELL], [2, 2, CELL, CELL]]], // 50%
  [4, [[0, 0, CELL, CELL]]], // 25%
  [8, [[0, 0, CELL, CELL], [4, 4, CELL, CELL]]], // 12%
  [8, [[0, 0, CELL, CELL]]], // 6%
];
const ROW = 8;

interface DitherFadeProps {
  direction?: 'down' | 'up';
  id: string;
}

export function DitherFade({ direction = 'down', id }: DitherFadeProps) {
  const rows = direction === 'down' ? STEPS : [...STEPS].reverse();
  const patternId = (index: number) => `${id}-${direction}-${index}`;
  return (
    <svg
      className="dither-fade"
      width="100%"
      height={rows.length * ROW}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <defs>
        {rows.map(([size, cells], index) => (
          <pattern key={index} id={patternId(index)} width={size} height={size} patternUnits="userSpaceOnUse">
            {cells.map(([x, y, width, height], cell) => (
              <rect key={cell} x={x} y={y} width={width} height={height} fill="currentColor" />
            ))}
          </pattern>
        ))}
      </defs>
      {rows.map((_, index) => (
        <rect key={index} x="0" y={index * ROW} width="100%" height={ROW} fill={`url(#${patternId(index)})`} />
      ))}
    </svg>
  );
}
