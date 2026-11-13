// The harness MCP server: one stdio process per worker, started by the worker CLI itself. It knows its
// cell from the environment and forwards every tool call to the bridge, which turns it into events.
//   HARNESS_BRIDGE  bridge base URL        HARNESS_TOKEN_FILE  file holding the pairing token
//   HARNESS_RUN     run id                 HARNESS_NODE   this worker's node id
//   HARNESS_CWD     the worker's folder    HARNESS_TOOLS  comma list of tools this worker may call
// Plain JS so the worker CLI can start it with node and no build step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { z } from "zod";

const env = process.env;
const token = readFileSync(env.HARNESS_TOKEN_FILE, "utf8").trim();
const allowed = new Set((env.HARNESS_TOOLS ?? "").split(",").filter(Boolean));

/** POST to the bridge with no client timeout: spawn_task and request_asset block until the work is done. */
function call(tool, args) {
  const body = JSON.stringify({ run: env.HARNESS_RUN, node: env.HARNESS_NODE, cwd: env.HARNESS_CWD, tool, args });
  const url = new URL("/internal/tool", env.HARNESS_BRIDGE);
  return new Promise((resolve) => {
    const req = request(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (text += d));
      res.on("end", () => {
        let j;
        try {
          j = JSON.parse(text);
        } catch {
          j = { error: text || `bridge answered ${res.statusCode}` };
        }
        resolve(j.error ? { isError: true, content: [{ type: "text", text: String(j.error) }] } : { content: [{ type: "text", text: JSON.stringify(j.result ?? {}) }] });
      });
    });
    req.on("error", (e) => resolve({ isError: true, content: [{ type: "text", text: `bridge unreachable: ${e.message}` }] }));
    req.end(body);
  });
}

const server = new McpServer({ name: "harness", version: "1.0.0" });
const tool = (name, description, inputSchema) => {
  if (allowed.has(name)) server.registerTool(name, { description, inputSchema }, (args) => call(name, args));
};

const ICONS = "spark game cube agent image film megaphone wave globe record check layers scissors ruler camera book cog chip chart alert music moon link sun code doc box play road sword person layout hammer pencil robot house rig dot";
const KINDS = ["image", "frames", "video", "model3d", "audio", "chart", "doc", "code", "link"];

tool("report_step", "Show one step of your work on your cell in the harness graph. Call it whenever you start a new piece of work.", {
  title: z.string().describe("short, present tense, e.g. 'Writing the race loop'"),
  detail: z.string().optional().describe("one line of detail"),
  icon: z.string().optional().describe(`one of: ${ICONS}`),
});
tool("attach_evidence", "Attach a file you made as evidence on your cell (an image, a video, a document, code, a chart).", {
  path: z.string().describe("path of the file, absolute or relative to your working folder"),
  kind: z.enum(KINDS).describe("what the file is"),
  caption: z.string().optional(),
});
tool("spawn_task", "Hand a sub-task to a new worker, or to an installed module by id. It appears as a child cell of yours; the call returns when it is done, with its summary and files.", {
  label: z.string().describe("two or three words for the child cell"),
  module: z.string().optional().describe("an installed module id to run instead of a general worker"),
  prompt: z.string().describe("everything the child needs to do the sub-task on its own"),
});
tool("request_asset", "Ask the harness for a generated asset. The call returns when it is ready, with its path.", {
  kind: z.enum(["image", "model3d", "video", "voice", "music"]),
  prompt: z.string().describe("what the asset should be"),
  refs: z.array(z.string()).optional().describe("paths of reference files"),
});
tool("publish_output", "Publish a finished deliverable of your cell (shown as an output, with an optional link).", {
  name: z.string(),
  path: z.string(),
  kind: z.string().describe("e.g. game, video, doc, image, site"),
  href: z.string().optional().describe("a URL where it can be opened"),
});

await server.connect(new StdioServerTransport());
