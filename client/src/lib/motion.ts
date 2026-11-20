/* Motion core, ported from the JCI Intelligence kit (shared/engine.js: the page's one frame loop and Spring).
   Anything that follows the pointer or slides between places rides a spring; one requestAnimationFrame loop
   serves the whole page and sleeps when nothing moves.

   Spring keeps the kit's short field names (x, v, t, k, c, eps): the kit's liquid-glass.js, vendored
   unchanged, reads them. */

const DEFAULT_STIFFNESS = 100;
const DEFAULT_DAMPING = 18;
const MAX_FLUSH_FRAMES = 1200;

const motionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** True when the person asked the system for less motion. Springs then jump to their targets. */
export const reduced = (): boolean => motionQuery?.matches ?? false;

/** One step of an animation. Returns true while anything is still moving. */
export type MotionTask = (deltaSeconds: number, now: number) => boolean;

const tasks = new Set<MotionTask>();
let frameId = 0;
let lastTime = 0;

function frame(now: number) {
  const deltaSeconds = Math.min(1 / 30, Math.max(1 / 240, (now - lastTime) / 1000));
  lastTime = now;
  tasks.forEach((task) => {
    let keep = false;
    try {
      keep = task(deltaSeconds, now);
    } catch (error) {
      console.error(error);
    }
    if (!keep) tasks.delete(task);
  });
  frameId = tasks.size ? requestAnimationFrame(frame) : 0;
}

// A hidden page gets no frames, so motion is played to its end at once: the page is complete whenever it is seen.
function flush(task: MotionTask) {
  let now = performance.now();
  for (let step = 0; step < MAX_FLUSH_FRAMES; step++) {
    let keep = false;
    try {
      keep = task(1 / 60, now);
    } catch (error) {
      console.error(error);
    }
    if (!keep) return;
    now += 1000 / 60;
  }
}

export function schedule(task: MotionTask) {
  if (document.hidden) {
    flush(task);
    return;
  }
  tasks.add(task);
  if (!frameId) {
    lastTime = performance.now();
    frameId = requestAnimationFrame(frame);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !tasks.size) return;
    const pending = Array.from(tasks);
    tasks.clear();
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    pending.forEach(flush);
  });
}

/** Wraps a tick in the page's frame loop. Call the returned wake() whenever a target changes. */
export function animator(tick: MotionTask): () => void {
  let active = false;
  const task: MotionTask = (deltaSeconds, now) => {
    let more = false;
    try {
      more = tick(deltaSeconds, now);
    } finally {
      if (!more) active = false;
    }
    return more;
  };
  return () => {
    if (!active) {
      active = true;
      schedule(task);
    }
  };
}

export interface SpringOptions {
  /** Stiffness. */
  k?: number;
  /** Damping. */
  c?: number;
  /** How close to the target counts as arrived. */
  eps?: number;
}

export class Spring {
  /** Position. */
  x: number;
  /** Target. */
  t: number;
  /** Velocity, in units per second. */
  v = 0;
  k: number;
  c: number;
  eps: number;

  constructor(position = 0, options: SpringOptions = {}) {
    this.x = position;
    this.t = position;
    this.k = options.k || DEFAULT_STIFFNESS;
    this.c = options.c || DEFAULT_DAMPING;
    this.eps = options.eps || 0.01;
  }

  /** Sets the target. With jump (or reduced motion) the spring is placed there instead of travelling. */
  to(target: number, jump?: boolean): this {
    this.t = target;
    if (jump || reduced()) {
      this.x = target;
      this.v = 0;
    }
    return this;
  }

  /** Advances the spring. Returns true while it is still moving. */
  step(deltaSeconds: number): boolean {
    if (this.x === this.t && this.v === 0) return false;
    const substeps = Math.max(1, Math.ceil(deltaSeconds * 240));
    const stepSeconds = deltaSeconds / substeps;
    for (let index = 0; index < substeps; index++) {
      const acceleration = -this.k * (this.x - this.t) - this.c * this.v;
      this.v += acceleration * stepSeconds;
      this.x += this.v * stepSeconds;
    }
    if (Math.abs(this.x - this.t) < this.eps && Math.abs(this.v) < this.eps * 10) {
      this.x = this.t;
      this.v = 0;
      return false;
    }
    return true;
  }
}
