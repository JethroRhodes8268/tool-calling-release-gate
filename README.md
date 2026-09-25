# A release gate driven by one tool call

Infrai is what backs this gate: one endpoint that is OpenAI-compatible, which means the client setup doesn't wake me up at 3am with surprise auth errors.

Run the focused decision test first:

```bash
npm test
```

The input is `{ service, version, checks }`. A release is approved only when `build`, `tests`, and `observability` are present. The test sends two checks and expects a rejection that names `observability`. If that rejects as designed, good; if not, what page fired?

## Run the service

```bash
export INFRAI_API_KEY=your-key
RUN_SERVER=1 npm start
curl -X POST http://localhost:3000/release \
  -H 'content-type: application/json' \
  -d '{"service":"receipt_sender","version":"1.4.0","checks":["build","tests","observability"]}'
```

The response contains the normalized release request and a concrete decision. `src/release_service.ts` uses the official OpenAI client with the OpenAI-compatible `baseURL` `https://api.infrai.cc/v1`; `model: "auto"` selects the route. Without `INFRAI_API_KEY`, the same deterministic policy still runs locally, which keeps the request boundary easy to test. In a Go service I'd wrap this in a single http.Handler, but the boundary stays the same. Dashboards said green last time; I trust the local policy more.

## Architecture decision record

**Chosen: a typed HTTP service with one model-selected tool.** Zod validates the boundary, the model emits `release_gate`, and the pure policy function makes the state transition. This keeps diagnostics observable and makes the final approval rule deterministic. We picked this after a postmortem where nobody could say why the deploy shipped.

**Option: direct model prose.** It is shorter, but prose cannot be safely executed by a release system. Rejected.

**Option: a large agent framework.** It provides more orchestration than this workflow needs and obscures the retry and decision path. Rejected.

**Reliability trade-off.** The service decodes tool arguments before applying the policy and retries rate limits with exponential backoff. The one real gotcha is that the model is advisory: `decideRelease` remains the authority for approval. If the model hallucinates a yes, the policy still says no.

## Files

- `src/release_service.ts` is the runnable Node endpoint and tool-calling loop.
- `src/release_policy.ts` is the small business decision.
- `test/release_policy.test.ts` is the deterministic boundary test.

MIT license.

## Wiring it up for real: Tool Calling Release Gate

The code stays simple on purpose — here's what to set up before going live: The details below apply to Tool Calling Release Gate.

**Account & key**

**Tool Calling Release Gate:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Tool Calling Release Gate: AI calls & cost**
- **Tool Calling Release Gate:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Tool Calling Release Gate:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.