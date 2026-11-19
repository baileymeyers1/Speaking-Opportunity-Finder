/* The theme switch's reveal, ported from the JCI Intelligence kit (kit.js, themeToggle): the new theme opens
   as a circle from where the switch's knob lands. */

const GRID_COLUMNS = 40;
const GRID_ROWS = 26;
const STEPS = 30;

/**
 * Keyframes for a circle whose covered area, not its radius, eases in and out, so it never races and then
 * crawls into the far corner. Written in percentages of the snapshot: some Chromium embeds read px inside a
 * view-transition pseudo-element at half scale, which opens the circle from the wrong place.
 */
export function revealFrames(
  originX: number,
  originY: number,
  width: number = window.innerWidth,
  height: number = window.innerHeight
): Keyframe[] {
  // Distance from the origin to every cell of a grid over the viewport, nearest first: the radius that
  // covers a given share of the screen is the distance at that share of the list.
  const distances: number[] = [];
  for (let column = 0; column < GRID_COLUMNS; column++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      distances.push(
        Math.hypot(((column + 0.5) / GRID_COLUMNS) * width - originX, ((row + 0.5) / GRID_ROWS) * height - originY)
      );
    }
  }
  distances.sort((a, b) => a - b);

  const farthestCorner = Math.hypot(Math.max(originX, width - originX), Math.max(originY, height - originY)) + 2;
  // circle() resolves a percentage radius against the box diagonal over the square root of two.
  const percentUnit = Math.hypot(width, height) / Math.SQRT2 / 100;
  const at = `at ${((originX / width) * 100).toFixed(3)}% ${((originY / height) * 100).toFixed(3)}%`;

  const frames: Keyframe[] = [];
  for (let step = 0; step <= STEPS; step++) {
    const progress = step / STEPS;
    const share = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    const radius =
      step === 0
        ? 0
        : step === STEPS
          ? farthestCorner
          : distances[Math.min(distances.length - 1, Math.round(share * (distances.length - 1)))];
    frames.push({ offset: progress, clipPath: `circle(${(radius / percentUnit).toFixed(3)}% ${at})` });
  }
  return frames;
}
