// The game design: what the design worker answers (a strict JSON schema, so both worker CLIs accept it),
// the safe ranges every number is clamped to, and the one-page design.md written from it.
// Both engine orchestrators build from this one object, so the two games share track, karts, riders and rules.

export type Design = {
  title: string;
  pitch: string;
  laps: number;
  track: {
    shape: "oval" | "squircle" | "bean" | "wavy" | "kidney";
    length: number;
    width: number;
    hills: number;
    seed: number;
    loops: number;
    twists: number;
    bank: number;
    drop: number;
    hover: boolean;
    loopRadius: number;
    notes: string;
  };
  karts: { count: number; topSpeed: number; accel: number; grip: number; steer: number; colors: string[]; names: string[]; notes: string };
  riders: { weapon: "club" | "glove" | "noodle"; height: number; skin: string; notes: string };
  combat: { range: number; cooldown: number; knock: number; slow: number; aiAggression: number; hitColor: string; rules: string };
  hud: { title: string; accent: string; minimap: boolean };
  look: { sky: string; ground: string };
  win: string;
  art: { kind: "image" | "model3d" | "music"; name: string; prompt: string; use: string }[];
  /** what each generated 3D model shows; the art team makes all of them at once (see modelSlots) */
  models: { kart: string; riders: Record<RiderClass, string>; landmarks: string[]; trophy: string };
};

/** the four rider classes, each with its own attack (the engines implement them) */
export const RIDER_CLASSES = ["volt", "sniper", "shrink", "thrower"] as const;
export type RiderClass = (typeof RIDER_CLASSES)[number];
export const CLASS_INFO: Record<RiderClass, { name: string; attack: string }> = {
  volt: { name: "Volt", attack: "an electric dash: a short burst of speed that zaps anyone it touches" },
  sniper: { name: "Sniper", attack: "aims with the mouse crosshair and shoots a beam, once every 10 seconds" },
  shrink: { name: "Shrink", attack: "turns small and fast for a few seconds, but a bump while small slows it down a lot" },
  thrower: { name: "Thrower", attack: "throws an item forwards every 3 seconds, automatically" },
};

const str = { type: "string" };
const num = { type: "number" };
const int = { type: "integer" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

/** strict: every object closes its properties and requires all of them */
export const designSchema = obj({
  title: str,
  pitch: str,
  laps: int,
  track: obj({
    shape: { type: "string", enum: ["oval", "squircle", "bean", "wavy", "kidney"] },
    length: num, width: num, hills: num, seed: int,
    loops: int, twists: int, bank: num, drop: num, hover: { type: "boolean" }, loopRadius: num,
    notes: str,
  }),
  karts: obj({ count: int, topSpeed: num, accel: num, grip: num, steer: num, colors: { type: "array", items: str }, names: { type: "array", items: str }, notes: str }),
  riders: obj({ weapon: { type: "string", enum: ["club", "glove", "noodle"] }, height: num, skin: str, notes: str }),
  combat: obj({ range: num, cooldown: num, knock: num, slow: num, aiAggression: num, hitColor: str, rules: str }),
  hud: obj({ title: str, accent: str, minimap: { type: "boolean" } }),
  look: obj({ sky: str, ground: str }),
  win: str,
  art: { type: "array", items: obj({ kind: { type: "string", enum: ["image", "model3d", "music"] }, name: str, prompt: str, use: str }) },
  models: obj({ kart: str, riders: obj({ volt: str, sniper: str, shrink: str, thrower: str }), landmarks: { type: "array", items: str }, trophy: str }),
});

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const text = (v: unknown, d: string, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);

export const DEFAULT: Design = {
  title: "Brawl Karts",
  pitch: "Six karts, six riders with clubs, one track that loops, twists and hovers.",
  laps: 2,
  track: { shape: "bean", length: 700, width: 14, hills: 1.5, seed: 1, loops: 1, twists: 1, bank: 0.6, drop: 14, hover: true, loopRadius: 13, notes: "" },
  karts: { count: 6, topSpeed: 26, accel: 9, grip: 6, steer: 9, colors: ["#e8463c", "#3c8ee8", "#f2c230", "#3cc47a", "#b25ce8", "#f08a3c"], names: ["Blaze", "Volt", "Sunny", "Moss", "Grape", "Ember"], notes: "" },
  riders: { weapon: "club", height: 1, skin: "#f1c27d", notes: "" },
  combat: { range: 4.5, cooldown: 1.6, knock: 7, slow: 0.45, aiAggression: 0.6, hitColor: "#ffd23c", rules: "" },
  hud: { title: "Brawl Karts", accent: "#ffd23c", minimap: true },
  look: { sky: "#7fb4e6", ground: "#5f9e4a" },
  win: "First across the line after the last lap wins.",
  art: [],
  models: {
    kart: "a chunky toy racing kart body with a big rear spoiler, side pods and a low open seat, no driver, no wheels",
    riders: {
      volt: "a chunky toy racer figure in a padded blue suit with a glowing coil backpack and a lightning bolt helmet, sitting with both arms reaching forward",
      sniper: "a chunky toy racer figure in a red flight jacket and big round goggles with a long scoped blaster on the back, sitting with both arms reaching forward",
      shrink: "a chunky toy racer figure in a purple lab coat with a bubbling potion flask on the belt and a propeller cap, sitting with both arms reaching forward",
      thrower: "a chunky toy racer figure in an orange vest with a bulging satchel of throwing balls across the chest, sitting with both arms reaching forward",
    },
    landmarks: [
      "a giant cartoon lighthouse built from stacked red and white traffic cones",
      "a huge stone arch shaped like a wrench and a spanner crossing each other",
    ],
    trophy: "a shiny golden racing trophy cup with two big handles on a stepped base, a tiny kart on top",
  },
};

/** every generated model the games use: slot name, prompt, longest side in studs and a triangle budget */
export function modelSlots(d: Design): { slot: string; prompt: string; size: number; tris: number }[] {
  return [
    { slot: "kart", prompt: d.models.kart, size: 7, tris: 2500 },
    // the rider sits on the game's own kart, so its model is the figure alone (a "steering wheel" draws a whole car)
    ...RIDER_CLASSES.map((c) => ({ slot: `rider.${c}`, prompt: `${d.models.riders[c].replace(/,?\s*as if (holding|gripping|on) a steering wheel/gi, "")}, the figure alone with no vehicle, kart, car or seat`, size: 4, tris: 2500 })),
    ...d.models.landmarks.map((p, i) => ({ slot: `landmark.${i + 1}`, prompt: p, size: 30, tris: 3000 })),
    { slot: "trophy", prompt: d.models.trophy, size: 5, tris: 2000 },
  ];
}

/** fills gaps and clamps every number to what the game code handles well */
export function tidyDesign(x: Partial<Design> | undefined): Design {
  const d = (x ?? {}) as any;
  const t = d.track ?? {};
  const k = d.karts ?? {};
  const r = d.riders ?? {};
  const c = d.combat ?? {};
  const D = DEFAULT;
  const count = Math.round(clamp(k.count, 2, 8, D.karts.count));
  const list = (v: unknown, fb: string[], ok: (s: string) => boolean) => {
    const a = Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && ok(s)) : [];
    return [...a, ...fb.filter((s) => !a.includes(s))].slice(0, 8);
  };
  return {
    title: text(d.title, D.title, 40),
    pitch: text(d.pitch, D.pitch, 300),
    laps: Math.round(clamp(d.laps, 1, 3, D.laps)),
    track: {
      shape: ["oval", "squircle", "bean", "wavy", "kidney"].includes(t.shape) ? t.shape : D.track.shape,
      length: clamp(t.length, 450, 1100, D.track.length),
      width: clamp(t.width, 11, 20, D.track.width),
      hills: clamp(t.hills, 0, 4, D.track.hills),
      seed: Math.round(clamp(t.seed, 1, 9999, D.track.seed)),
      loops: Math.round(clamp(t.loops, 0, 2, D.track.loops)),
      twists: Math.round(clamp(t.twists, 0, 2, D.track.twists)),
      bank: clamp(t.bank, 0, 1, D.track.bank),
      drop: clamp(t.drop, 0, 24, D.track.drop),
      hover: typeof t.hover === "boolean" ? t.hover : D.track.hover,
      loopRadius: clamp(t.loopRadius, 10, 18, D.track.loopRadius),
      notes: text(t.notes, "", 300),
    },
    karts: {
      count,
      topSpeed: clamp(k.topSpeed, 18, 34, D.karts.topSpeed),
      accel: clamp(k.accel, 5, 14, D.karts.accel),
      grip: clamp(k.grip, 3, 10, D.karts.grip),
      steer: clamp(k.steer, 5, 14, D.karts.steer),
      colors: list(k.colors, D.karts.colors.concat(["#e8e8e8", "#3cd6d6"]), (s) => /^#[0-9a-f]{6}$/i.test(s)),
      names: list(k.names, D.karts.names.concat(["Ghost", "Teal"]), (s) => /^[\w -]{1,12}$/.test(s)),
      notes: text(k.notes, "", 300),
    },
    riders: {
      weapon: ["club", "glove", "noodle"].includes(r.weapon) ? r.weapon : D.riders.weapon,
      height: clamp(r.height, 0.8, 1.25, D.riders.height),
      skin: hex(r.skin, D.riders.skin),
      notes: text(r.notes, "", 300),
    },
    combat: {
      range: clamp(c.range, 3, 7, D.combat.range),
      cooldown: clamp(c.cooldown, 0.8, 3, D.combat.cooldown),
      knock: clamp(c.knock, 3, 12, D.combat.knock),
      slow: clamp(c.slow, 0.2, 0.8, D.combat.slow),
      aiAggression: clamp(c.aiAggression, 0.2, 1, D.combat.aiAggression),
      hitColor: hex(c.hitColor, D.combat.hitColor),
      rules: text(c.rules, "", 400),
    },
    hud: { title: text(d.hud?.title, text(d.title, D.hud.title, 40), 40), accent: hex(d.hud?.accent, D.hud.accent), minimap: d.hud?.minimap !== false },
    look: { sky: hex(d.look?.sky, D.look.sky), ground: hex(d.look?.ground, D.look.ground) },
    win: text(d.win, D.win, 300),
    art: (Array.isArray(d.art) ? d.art : [])
      .filter((a: any) => a && ["image", "model3d", "music"].includes(a.kind) && typeof a.prompt === "string" && a.prompt.trim())
      .slice(0, 4)
      .map((a: any, i: number) => ({ kind: a.kind, name: text(a.name, `art-${i + 1}`, 40), prompt: a.prompt.trim().slice(0, 300), use: text(a.use, "", 120) })),
    models: {
      kart: text(d.models?.kart, D.models.kart, 300),
      riders: Object.fromEntries(RIDER_CLASSES.map((c) => [c, text(d.models?.riders?.[c], D.models.riders[c], 300)])) as Record<RiderClass, string>,
      landmarks: (Array.isArray(d.models?.landmarks) ? d.models.landmarks : [])
        .filter((x: unknown): x is string => typeof x === "string" && !!x.trim())
        .map((x: string) => x.trim().slice(0, 300))
        .concat(D.models.landmarks)
        .slice(0, 2),
      trophy: text(d.models?.trophy, D.models.trophy, 300),
    },
  };
}

/** the game.json sections a Unity part writes (the Roblox side reads the same object) */
export function unitySections(d: Design) {
  const { notes: _tn, ...track } = d.track;
  const { notes: _kn, ...karts } = d.karts;
  const { notes: _rn, ...riders } = d.riders;
  const { rules: _cr, ...combat } = d.combat;
  return { title: d.title, laps: d.laps, track, karts, riders, combat, hud: d.hud, look: { ...d.look, night: false, realistic: false } };
}

export function designMarkdown(d: Design): string {
  const t = d.track;
  const feat = [
    t.loops ? `${t.loops} loop${t.loops > 1 ? "s" : ""} (radius ${t.loopRadius.toFixed(0)} m)` : "",
    t.twists ? `${t.twists} corkscrew twist${t.twists > 1 ? "s" : ""}` : "",
    t.drop ? `a ${t.drop.toFixed(0)} m climb and plunge` : "",
    t.bank > 0.05 ? `corners banked up to ${Math.round(15 + 65 * t.bank)} degrees` : "flat corners",
    t.hover ? "glowing hover sections on loops, twists and steep banks (karts lift off and get a boost)" : "",
  ].filter(Boolean);
  return [
    `# ${d.title}`,
    "",
    d.pitch,
    "",
    "## Track",
    "",
    `A ${t.shape} circuit, ${t.length.toFixed(0)} m around, ${t.width.toFixed(0)} m wide, hills of ${t.hills.toFixed(1)} m. ${d.laps} lap${d.laps > 1 ? "s" : ""}.`,
    "",
    ...feat.map((f) => `- ${f}`),
    ...(t.notes ? ["", t.notes] : []),
    "",
    "## Karts",
    "",
    `${d.karts.count} karts: ${d.karts.names.slice(0, d.karts.count).join(", ")}. Top speed ${(d.karts.topSpeed * 3.6).toFixed(0)} km/h, arcade grip.`,
    ...(d.karts.notes ? ["", d.karts.notes] : []),
    "",
    "## Riders and combat",
    "",
    `Each kart carries a humanoid rider of one of four classes, each with its own attack. A hit knocks the victim sideways and cuts its speed to ${Math.round(d.combat.slow * 100)}%, with a burst of colour.`,
    "",
    ...RIDER_CLASSES.map((c) => `- **${CLASS_INFO[c].name}**: ${CLASS_INFO[c].attack}. Looks like ${d.models.riders[c]}.`),
    ...(d.combat.rules ? ["", d.combat.rules] : []),
    ...(d.riders.notes ? ["", d.riders.notes] : []),
    "",
    "## Winning",
    "",
    d.win,
    "",
    "## Shared art",
    "",
    ...(d.art.length ? d.art.map((a) => `- **${a.name}** (${a.kind}): ${a.prompt}${a.use ? ` Used for: ${a.use}.` : ""}`) : ["- none requested"]),
    "",
    "## 3D models",
    "",
    `- **Kart body**: ${d.models.kart}`,
    ...d.models.landmarks.map((l, i) => `- **Landmark ${i + 1}** (beside the track): ${l}`),
    `- **Trophy** (at the finish): ${d.models.trophy}`,
    "",
  ].join("\n");
}
