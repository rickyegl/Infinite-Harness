// A real worker run that exercises the harness MCP: report_step, then spawn_task three times; each child
// writes one file and attaches it. HARNESS_MOCK=1 replays fixtures/default.jsonl instead (recorded from a
// real run with `pnpm fixture`).

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const prompt = [
    `Request: ${input.prompt}`,
    "",
    "Use only the harness tools; do not write any file yourself.",
    "1. Call report_step once with a short title for your plan.",
    "2. Split the request into exactly three sub-tasks and call spawn_task once for each, one after another.",
    "   Give each a label of two or three words. Each child's prompt must say: write one short plain-text",
    "   file named answer.txt in your working folder with your answer (one or two lines), then call",
    "   attach_evidence with that path, kind doc and a caption of a few words, then reply with your answer.",
    "3. When all three have returned, reply with one sentence that sums up the three answers.",
  ].join("\n");
  const r = await ctx.agent(prompt);
  return { summary: r.text.trim().split("\n")[0] || "Done" };
}
