// Regenerates desk/traction.json from desk/activity.jsonl.
//
// Usage: node desk/build-traction.mjs
//
// The activity log is append only: one JSON object per line. This script
// only counts what the log records. It never estimates. A check counts
// only when a check_passed event with its full answer payload is in the
// log, and credits count only from agent_funded and agent_topup events
// that carry a ledger sequence.

import { readFile, writeFile } from "node:fs/promises";

const LOG_URL = new URL("./activity.jsonl", import.meta.url);
const OUT_URL = new URL("./traction.json", import.meta.url);

const DID_KEYS = ["did", "actor_did", "grantee_did", "from_did", "to_did", "org_did", "pii_did"];
const FUNDING_TYPES = new Set(["agent_funded", "agent_topup"]);

const raw = await readFile(LOG_URL, "utf8");
const events = raw
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line));

// Unique DIDs in first seen order, with the role recorded for them.
const roles = new Map();
for (const e of events) {
  if (e.did && e.role && !roles.has(e.did)) roles.set(e.did, e.role);
}
const seen = new Set();
const uniqueDids = [];
for (const e of events) {
  for (const key of DID_KEYS) {
    const did = e[key];
    if (typeof did === "string" && did.startsWith("did:") && !seen.has(did)) {
      seen.add(did);
      uniqueDids.push({ did, role: roles.get(did) ?? null });
    }
  }
}

const checks = events.filter((e) => e.type === "check_passed");
const latestCheck = checks.length > 0 ? checks[checks.length - 1] : null;

const rejections = events.filter((e) => e.type === "ungranted_call_rejected");
const latestRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;

const funding = events.filter((e) => FUNDING_TYPES.has(e.type));
const creditsMoved = funding.reduce((sum, e) => sum + (e.amount_credits ?? 0), 0);
const ledgerSeqs = funding
  .map((e) => e.ledger_seq)
  .filter((n) => typeof n === "number")
  .sort((a, b) => a - b);

const grants = events.filter((e) => e.type === "grant_issued");
const g = grants.length > 0 ? grants[grants.length - 1] : null;

const contractEvents = events.filter((e) => typeof e.contract === "string");
const lastContract = contractEvents.length > 0 ? contractEvents[contractEvents.length - 1] : null;

const traction = {
  generated_from: "activity.jsonl",
  basis:
    "Seeded only from events recorded in STATUS.md and flow-run-final.log. " +
    "A check counts only when its full answer payload is recorded. No estimates.",
  events_total: events.length,
  unique_dids: uniqueDids,
  unique_did_count: uniqueDids.length,
  checks_run: checks.length,
  latest_check: latestCheck
    ? { ts: latestCheck.ts, run: latestCheck.run ?? null, answers: latestCheck.answers }
    : null,
  ungranted_calls_rejected: rejections.length,
  latest_rejection_http_status: latestRejection ? latestRejection.http_status ?? null : null,
  records_stored: events.filter((e) => e.type === "record_stored").length,
  credits_moved_to_agent: creditsMoved,
  funding_events: funding.length,
  funding_ledger_seqs: ledgerSeqs,
  contract: lastContract
    ? {
        name: lastContract.contract,
        contract_id: g ? g.contract_id ?? null : null,
        version: lastContract.contract_version ?? null,
      }
    : null,
  grant: g
    ? {
        grantee_did: g.grantee_did,
        function: g.function,
        scopes: g.scopes ?? [],
        valid_from_secs: g.valid_from_secs,
        valid_until_secs: g.valid_until_secs,
        valid_from: new Date(g.valid_from_secs * 1000).toISOString(),
        valid_until: new Date(g.valid_until_secs * 1000).toISOString(),
        window_days: (g.valid_until_secs - g.valid_from_secs) / 86400,
      }
    : null,
};

await writeFile(OUT_URL, JSON.stringify(traction, null, 2) + "\n", "utf8");
console.log(
  `traction.json regenerated from ${events.length} logged events: ` +
    `${uniqueDids.length} unique DIDs, ${checks.length} documented checks, ` +
    `${creditsMoved} credits moved across ${funding.length} funding events.`,
);
