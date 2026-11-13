import type { GraphState } from "@harness/protocol";
import type { Cam } from "./camera.ts";
import type { Shot, Take, Timeline } from "./data.ts";
import type { Direction, Timebase } from "./direction.ts";

/** Everything a view needs to draw one frame. Built fresh for every t; views keep no state. */
export type Ctx = {
  tb: Timebase;
  state: GraphState;
  take: Take | null;
  dir: Direction;
  shot: Shot | null;
  timeline: Timeline | null;
  cam: Cam;
  /** artifact uri -> URL */
  url: (uri: string) => string;
  /** live mode only */
  onCell?: (id: string) => void;
  /** id of the cell in focus (live: clicked; director: direction.focus) */
  focus: string | null;
  /** ms since the current view was entered (live click, or shot start) */
  viewAge: number;
};

export const P = <T,>(ctx: Ctx, key: string, dflt: T): T => (ctx.dir.params?.[key] ?? dflt) as T;
