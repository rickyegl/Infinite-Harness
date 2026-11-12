// Beat grid shared by resolve.mjs and preview.mjs. Reads the shapes video/beats.json may take:
//   { bpm, offset }                          one steady tempo; offset = time of the first beat
//   { segments: [{ fromBar, bpm, at }] }     several tempos (one per music track); `at` = time of that bar's downbeat
//   { beats: [seconds, ...] }                explicit list, extrapolated past its end with the last interval
export function makeGrid(grid) {
  const bpb = grid.beatsPerBar ?? 4;
  let beatTime;
  if (Array.isArray(grid.beats)) {
    const b = grid.beats;
    beatTime = (i) => (i < b.length ? b[i] : b[b.length - 1] + (b[b.length - 1] - b[b.length - 2]) * (i - b.length + 1));
  } else if (Array.isArray(grid.segments)) {
    const segs = grid.segments.map((s) => ({ from: (s.fromBar - 1) * bpb, step: 60 / s.bpm, at: s.at })).sort((a, b) => a.from - b.from);
    beatTime = (i) => {
      let s = segs[0];
      for (const x of segs) if (i >= x.from) s = x;
      return s.at + (i - s.from) * s.step;
    };
  } else {
    beatTime = (i) => (grid.offset ?? 0) + (i * 60) / grid.bpm;
  }
  return { bpb, beatTime };
}
