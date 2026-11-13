import { describe, expect, it } from "vitest";
import { makeTimebase, TimeMap } from "./direction.ts";
import { fxAt } from "./fx.tsx";

const beatMs = 468.75;

describe("TimeMap", () => {
  it("interpolates between points and inverts", () => {
    const m = new TimeMap([[0, 8000], [4, 11750]]);
    expect(m.fwd(2)).toBe(9875);
    expect(m.inv(9875)).toBe(2);
  });
  it("extends the end segments' slope past both ends", () => {
    const m = new TimeMap([[4, 300], [5, 768.75]]);
    expect(m.fwd(6)).toBeCloseTo(1237.5);
    expect(m.fwd(3)).toBeCloseTo(-168.75);
  });
  it("a flat map holds the take still", () => {
    const m = new TimeMap([[0, 40000], [1, 40000]]);
    expect(m.fwd(0)).toBe(40000);
    expect(m.fwd(7.5)).toBe(40000);
  });
});

describe("makeTimebase", () => {
  it("maps shot ms to take ms through beats, and ages events in shot ms", () => {
    const tb = makeTimebase(2 * beatMs, beatMs, new TimeMap([[0, 0], [1, beatMs]]), "director");
    expect(tb.takeT).toBeCloseTo(2 * beatMs);
    expect(tb.age(beatMs)).toBeCloseTo(beatMs);
    expect(tb.beat(4)).toBe(1875);
  });
  it("without a map the take runs 1:1", () => {
    const tb = makeTimebase(1234, beatMs, null, "live");
    expect(tb.takeT).toBe(1234);
    expect(tb.age(1000)).toBe(234);
  });
});

describe("fxAt", () => {
  it("is a pure function of time", () => {
    const fx = [{ type: "shake" as const, beat: 0 }, { type: "flash" as const, beat: 0 }];
    expect(fxAt(fx, 100, beatMs)).toEqual(fxAt(fx, 100, beatMs));
  });
  it("flash fades out, fade to black ends opaque", () => {
    expect(fxAt([{ type: "flash", beat: 0 }], 0, beatMs).overlay?.opacity).toBeCloseTo(0.85);
    expect(fxAt([{ type: "flash", beat: 0 }], beatMs, beatMs).overlay).toBeNull();
    expect(fxAt([{ type: "fade", beat: 0 }], 10 * beatMs, beatMs).overlay?.opacity).toBe(1);
  });
});
