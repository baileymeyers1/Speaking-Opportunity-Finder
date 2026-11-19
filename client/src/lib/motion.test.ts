import { describe, expect, it } from 'vitest';
import { Spring } from './motion';

const FRAME = 1 / 60;

function settle(spring: Spring, maxFrames = 600): number {
  let frames = 0;
  while (spring.step(FRAME) && frames < maxFrames) frames++;
  return frames;
}

describe('Spring', () => {
  it('rests where it starts and reports nothing to do', () => {
    const spring = new Spring(12);
    expect(spring.step(FRAME)).toBe(false);
    expect(spring.x).toBe(12);
  });

  it('travels to its target and stops exactly on it', () => {
    const spring = new Spring(0, { k: 260, c: 26, eps: 0.05 });
    spring.to(120);
    expect(spring.step(FRAME)).toBe(true);
    expect(spring.x).toBeGreaterThan(0);
    expect(spring.x).toBeLessThan(120);

    const frames = settle(spring);
    expect(frames).toBeLessThan(600);
    expect(spring.x).toBe(120);
    expect(spring.v).toBe(0);
  });

  it('is placed, not moved, when told to jump', () => {
    const spring = new Spring(0);
    spring.to(48, true);
    expect(spring.x).toBe(48);
    expect(spring.step(FRAME)).toBe(false);
  });

  it('stays stable over a long frame by taking smaller steps', () => {
    const spring = new Spring(0, { k: 260, c: 26 });
    spring.to(100);
    spring.step(1 / 30);
    expect(Number.isFinite(spring.x)).toBe(true);
    expect(Math.abs(spring.x)).toBeLessThan(200);
  });
});
