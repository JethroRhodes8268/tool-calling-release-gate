export type ReleaseRequest = { service: string; version: string; checks: string[] };

export type ReleaseDecision = { approved: boolean; reason: string };

export function decideRelease(input: ReleaseRequest): ReleaseDecision {
  const required = new Set(["build", "tests", "observability"]);
  const missing = [...required].filter((check) => !input.checks.includes(check));
  if (missing.length > 0) return { approved: false, reason: `missing checks: ${missing.join(", ")}` };
  return { approved: true, reason: `${input.service}@${input.version} passed release gates` };
}
