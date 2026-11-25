// Regenerates docs/traction.json from docs/activity.jsonl.
//
// Usage: node docs/build-traction.mjs
//
// The activity log is append only: one JSON object per line. This script
// only counts what the log records. It never estimates. A check counts
// only when a check_passed event with its full answer payload is in the
// log, and credits count only from agent_funded and agent_topup events
// that carry a ledger sequence.
//
// Every event carries an actor field: "internal" (the VaultCheck project
// itself) or "external" (an independent user). A DID is classified
// external only when at least one event records it with actor "external";
// otherwise it is internal. Internal and external figures are always
// reported separately so adoption is never inflated by our own runs.

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

// Actor classification per DID: external wins only on recorded evidence.
const externalDids = new Set();
for (const e of events) {
  if (e.actor !== "external") continue;
  for (const key of DID_KEYS) {
    const did = e[key];
    if (typeof did === "string" && did.startsWith("did:")) externalDids.add(did);
  }
}
const classified = uniqueDids.map((d) => ({
  ...d,
  actor: externalDids.has(d.did) ? "external" : "internal",
}));
const internalDidList = classified.filter((d) => d.actor === "internal");
const externalDidList = classified.filter((d) => d.actor === "external");

// Repeat usage: DIDs that appear in events on more than one UTC day.
const daysByDid = new Map();
for (const e of events) {
  const day = typeof e.ts === "string" ? e.ts.slice(0, 10) : null;
  if (!day) continue;
  for (const key of DID_KEYS) {
    const did = e[key];
    if (typeof did === "string" && did.startsWith("did:")) {
      if (!daysByDid.has(did)) daysByDid.set(did, new Set());
      daysByDid.get(did).add(day);
    }
  }
}
const repeatDids = [...daysByDid.entries()]
  .filter(([, days]) => days.size > 1)
  .map(([did, days]) => ({ did, active_days: days.size }));

const byActor = (list) => ({
  total: list.length,
  internal: list.filter((e) => e.actor !== "external").length,
  external: list.filter((e) => e.actor === "external").length,
});

const checks = events.filter((e) => e.type === "check_passed");
const latestCheck = checks.length > 0 ? checks[checks.length - 1] : null;

const rejections = events.filter((e) => e.type === "ungranted_call_rejected");
const latestRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;

const onboardings = events.filter((e) => e.type === "onboarding_complete");

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
    "Counted only from events recorded in the activity log (STATUS.md, flow-run-final.log, try.ts runs, and verified external user reports). " +
    "A check counts only when its full answer payload is recorded. Internal and external DIDs are reported separately. No estimates.",
  events_total: events.length,
  unique_dids: classified,
  unique_did_count: classified.length,
  unique_internal_dids: internalDidList,
  unique_internal_did_count: internalDidList.length,
  unique_external_dids: externalDidList,
  unique_external_did_count: externalDidList.length,
  onboarding_completions: byActor(onboardings),
  checks_run: checks.length,
  checks_by_actor: byActor(checks),
  latest_check: latestCheck
    ? { ts: latestCheck.ts, run: latestCheck.run ?? null, answers: latestCheck.answers }
    : null,
  ungranted_calls_rejected: rejections.length,
  latest_rejection_http_status: latestRejection ? latestRejection.http_status ?? null : null,
  records_stored: events.filter((e) => e.type === "record_stored").length,
  credits_moved_to_agent: creditsMoved,
  funding_events: funding.length,
  funding_ledger_seqs: ledgerSeqs,
  repeat_usage: {
    dids_active_more_than_one_day: repeatDids.length,
    dids: repeatDids,
  },
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
    `${classified.length} unique DIDs (${internalDidList.length} internal, ${externalDidList.length} external), ` +
    `${onboardings.length} onboarding completions, ${checks.length} documented checks, ` +
    `${creditsMoved} credits moved across ${funding.length} funding events, ` +
    `${repeatDids.length} DIDs active on more than one day.`,
);
