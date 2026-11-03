import type { AdminSparklinePoint } from '../../types';

const WIDTH = 112;
const HEIGHT = 28;
const PAD = 3;

/**
 * Rows found per run over the last 14 days as a single-hue line. Error runs
 * are marked with a ring and the latest run with a filled dot; the text
 * alternative lists the values so the trend is readable without the picture.
 */
export function Sparkline({ points, label }: { points: AdminSparklinePoint[]; label: string }) {
  if (points.length === 0) {
    return <span className="text-xs text-muted-foreground">No runs in 14 days</span>;
  }

  const max = Math.max(1, ...points.map((p) => p.found));
  const stepX = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? PAD + index * stepX : WIDTH / 2,
    y: HEIGHT - PAD - (point.found / max) * (HEIGHT - PAD * 2),
    point,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const description = `${label}, rows found per run over 14 days, oldest first: ${points
    .map((p) => (p.status === 'error' ? 'error' : String(p.found)))
    .join(', ')}`;

  return (
    <svg
      role="img"
      aria-label={description}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className="shrink-0 overflow-visible text-primary"
    >
      {coords.length > 1 && (
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {coords
        .filter((c) => c.point.status === 'error')
        .map((c) => (
          <circle key={c.point.startedAt} cx={c.x} cy={c.y} r={3.5} fill="hsl(var(--background))" stroke="hsl(var(--destructive))" strokeWidth={2} />
        ))}
      <circle cx={last.x} cy={last.y} r={3} fill="currentColor" stroke="hsl(var(--background))" strokeWidth={1.5} />
    </svg>
  );
}
