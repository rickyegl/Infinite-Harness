// One clock for everything visual. Two drivers:
//   live:     t = performance.now() - origin (+ offset), ticked by requestAnimationFrame
//   director: t only changes through seek(ms) (window.__harness.seek), nothing advances on its own
// Components read t through useClock(); nothing else in the app reads time.

import { useSyncExternalStore } from "react";

export type ClockMode = "live" | "director";

export class Clock {
  readonly mode: ClockMode;
  private t = 0;
  private listeners = new Set<() => void>();
  private origin = 0;
  private raf = 0;

  constructor(mode: ClockMode, startMs = 0) {
    this.mode = mode;
    this.t = startMs;
    if (mode === "live") {
      this.origin = performance.now() - startMs;
      const tick = () => {
        this.t = performance.now() - this.origin;
        this.emit();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  get now(): number {
    return this.t;
  }

  /** director only: jump to ms */
  set(ms: number): void {
    this.t = ms;
    this.emit();
  }

  /** director "play" helper for watching a shot in a browser; capture never uses it */
  play(from: number, until: number, loop = true): void {
    const t0 = performance.now() - from;
    const tick = () => {
      let t = performance.now() - t0;
      if (t > until) {
        if (!loop) return this.set(until);
        t = t % until;
      }
      this.set(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export function useClock(clock: Clock): number {
  return useSyncExternalStore(clock.subscribe, () => clock.now);
}
