// Writes a draft direction file video/direction/<shot>.json for every shot in timeline.json (or the ids given).
// A draft takes the shot's view, a default camera for that view and its take's events spread evenly over the
// shot's beats. Files with "draft": false are hand-tuned and are kept unless --force.
//
//   node video/tools/direct.mjs            drafts for every shot that has no hand-tuned file
//   node video/tools/direct.mjs S28 S29    only these shots
//   node video/tools/direct.mjs --force    overwrite hand-tuned files too
//
// The format is described in plan/STATUS.md ("Direction files") and typed in apps/web/src/direction.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, timeline } from "./stage.mjs";

const force = process.argv.includes("--force");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tl = timeline();
const beatMs = 60000 / tl.grid.bpm;
const dir = join(repo, "video", "direction");
mkdirSync(dir, { recursive: true });

/** the take's events (a recorded take if there is one, else its fixture) */
function takeEvents(id) {
  for (const f of [join(repo, "video", "takes", id, "events.jsonl"), join(repo, "apps", "web", "fixtures", `${id}.jsonl`)]) {
    if (existsSync(f)) return readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  }
  return null;
}

const allTakes = [...new Set(tl.shots.map((s) => s.take).filter(Boolean))];
const quoted = (s) => (s.match(/'([^']+)'/) ?? [])[1] ?? null;

function draft(shot, i) {
  const d = { shot: shot.id, draft: true, view: shot.view };
  if (shot.take) d.take = shot.take;
  const evs = shot.take ? takeEvents(shot.take) : null;
  const end = evs ? evs.reduce((m, e) => Math.max(m, e.t), 0) : 0;
  const nodes = evs ? evs.filter((e) => e.type === "node.spawn") : [];

  switch (shot.view) {
    case "prompt":
      d.params = { say: shot.say };
      if (shot.take) d.events = { at: [[0, 0], [shot.beats, 0]] };
      break;
    case "graph":
      if (evs) d.events = { at: [[0, 0], [shot.beats, end]] };
      d.camera = [{ beat: 0, target: "all", dur: 0 }];
      break;
    case "focus": {
      if (evs) d.events = { at: [[0, 0], [shot.beats, end]] };
      const n = nodes.find((e) => e.kind !== "root");
      if (n) {
        d.focus = n.node;
        d.camera = [{ beat: 0, target: "all", dur: 0 }, { beat: 0, target: n.node, zoom: 1.6, dur: 1 }];
      }
      break;
    }
    case "split": {
      // a small take: its time runs 1:1 with the shot
      if (evs) d.events = { at: [[0, 0], [1, beatMs]] };
      const withEv = [...new Set(evs ? evs.filter((e) => e.type === "node.evidence").map((e) => e.node) : [])];
      d.params = { left: { node: withEv[0] }, right: { node: withEv[1] ?? withEv[0] } };
      d.camera = [{ beat: 0, target: "all", dur: 0 }];
      break;
    }
    case "wall":
      d.params = { layout: "grid", stagger: 0.5 };
      if (evs) d.events = { at: [[0, end], [1, end]] };
      break;
    case "banner":
      // one-cell take, 1:1 with the shot; the title is the shot's module, the line types in over the first bar
      if (evs) d.events = { at: [[0, 0], [1, beatMs]] };
      d.params = { title: shot.module ?? "", say: shot.say };
      d.camera = [{ beat: 0, target: "all", dur: 0 }];
      break;
    case "rain": {
      // consecutive rain shots double the prompt rate; the graph holds every take of the film
      let k = 0;
      while (i - k - 1 >= 0 && tl.shots[i - k - 1].view === "rain") k++;
      d.take = "main";
      d.mergeTakes = allTakes.filter((t) => t !== "main");
      d.params = { rate: 2 ** k, offset: k * 8 };
      const title = quoted(shot.screen);
      if (title) d.params.title = title;
      d.camera = [{ beat: 0, target: "all", zoom: 1.6 - k * 0.3, dur: 0 }, { beat: 0, target: "all", zoom: 1.3 - k * 0.3, dur: shot.beats, ease: "none" }];
      break;
    }
    case "title": {
      const s = shot.screen.toLowerCase();
      d.params = { mode: s.includes("fake") ? "fake" : s.includes("implode") ? "implode" : "end" };
      const sub = quoted(shot.screen);
      if (sub && d.params.mode === "end") d.params.sub = sub;
      break;
    }
  }
  d.note = `draft from shots.json: ${shot.screen}`;
  return d;
}

let wrote = 0, kept = 0;
tl.shots.forEach((shot, i) => {
  if (only.length && !only.includes(shot.id)) return;
  const file = join(dir, `${shot.id}.json`);
  if (!force && existsSync(file)) {
    const cur = JSON.parse(readFileSync(file, "utf8"));
    if (cur.draft === false) { kept++; return; }
  }
  writeFileSync(file, JSON.stringify(draft(shot, i), null, 2) + "\n");
  wrote++;
});
console.log(`direct: wrote ${wrote} draft(s), kept ${kept} hand-tuned file(s) in video/direction/`);
