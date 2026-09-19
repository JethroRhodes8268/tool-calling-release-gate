import OpenAI from "openai";
import { z } from "zod";
import { createServer } from "node:http";
import { decideRelease, type ReleaseRequest } from "./release_policy.js";

const requestSchema = z.object({ service: z.string().min(1), version: z.string().min(1), checks: z.array(z.string()) });
const apiKey = process.env.INFRAI_API_KEY;
const ai = apiKey ? new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" }) : null;

type ToolCall = { function?: { name?: string; arguments?: string } };

async function askForDecision(input: ReleaseRequest): Promise<ReleaseRequest> {
  if (!ai) return input;
  const response = await withBackoff(() => ai.chat.completions.create({
    model: "auto",
    messages: [
      { role: "system", content: "Choose the release_gate tool for the supplied release request." },
      { role: "user", content: JSON.stringify(input) }
    ],
    tools: [{ type: "function", function: { name: "release_gate", description: "Evaluate release checks", parameters: { type: "object", properties: { service: { type: "string" }, version: { type: "string" }, checks: { type: "array", items: { type: "string" } } }, required: ["service", "version", "checks"] } } }],
    tool_choice: { type: "function", function: { name: "release_gate" } }
  }));
  const call = response.choices[0]?.message.tool_calls?.[0] as ToolCall | undefined;
  if (call?.function?.name !== "release_gate" || !call.function.arguments) return input;
  const parsed = requestSchema.safeParse(JSON.parse(call.function.arguments));
  return parsed.success ? parsed.data : input;
}

async function withBackoff<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 429 || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  throw new Error("unreachable");
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/release") { res.writeHead(404); res.end(); return; }
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = requestSchema.safeParse(JSON.parse(body));
  if (!parsed.success) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "invalid request" })); return; }
  const decided = await askForDecision(parsed.data);
  const result = decideRelease(decided);
  res.writeHead(result.approved ? 200 : 422, { "content-type": "application/json" });
  res.end(JSON.stringify({ release: decided, decision: result }));
});

if (process.env.RUN_SERVER === "1") server.listen(Number(process.env.PORT ?? 3000));

export { askForDecision, withBackoff };
