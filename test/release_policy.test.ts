import assert from "node:assert/strict";
import { decideRelease } from "../src/release_policy.js";

const decision = decideRelease({ service: "receipt_sender", version: "1.4.0", checks: ["build", "tests"] });
assert.equal(decision.approved, false);
assert.match(decision.reason, /observability/);
console.log("release policy test passed");
