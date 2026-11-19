import { describe, expect, it } from 'vitest';
import { revealFrames } from './themeReveal';

const WIDTH = 1280;
const HEIGHT = 800;
const PERCENT_UNIT = Math.hypot(WIDTH, HEIGHT) / Math.SQRT2 / 100;

function radiusOf(frame: Keyframe): number {
  const match = /circle\(([\d.]+)% at/.exec(String(frame.clipPath));
  if (!match) throw new Error(`no circle in ${String(frame.clipPath)}`);
  return Number(match[1]) * PERCENT_UNIT;
}

describe('revealFrames', () => {
  // The switch sits in the header's top right corner.
  const frames = revealFrames(1180, 32, WIDTH, HEIGHT);

  it('starts closed and ends past the farthest corner', () => {
    expect(radiusOf(frames[0])).toBe(0);
    const farthestCorner = Math.hypot(1180, HEIGHT - 32);
    expect(radiusOf(frames[frames.length - 1])).toBeGreaterThanOrEqual(farthestCorner);
  });

  it('only ever grows, on evenly spaced offsets from 0 to 1', () => {
    const radii = frames.map(radiusOf);
    radii.slice(1).forEach((radius, index) => expect(radius).toBeGreaterThanOrEqual(radii[index]));
    expect(frames[0].offset).toBe(0);
    expect(frames[frames.length - 1].offset).toBe(1);
  });

  it('opens from the origin, written in percentages of the viewport', () => {
    expect(String(frames[5].clipPath)).toContain('at 92.188% 4.000%');
  });

  it('covers half the screen at the halfway frame', () => {
    const halfway = radiusOf(frames[(frames.length - 1) / 2]);
    // Share of the viewport within that radius of the origin, sampled on a fine grid.
    let inside = 0;
    const samples = 200;
    for (let column = 0; column < samples; column++) {
      for (let row = 0; row < samples; row++) {
        const x = ((column + 0.5) / samples) * WIDTH;
        const y = ((row + 0.5) / samples) * HEIGHT;
        if (Math.hypot(x - 1180, y - 32) <= halfway) inside++;
      }
    }
    expect(inside / (samples * samples)).toBeCloseTo(0.5, 1);
  });
});
