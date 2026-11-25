# VaultCheck desk

The public eligibility desk and traction dashboard for VaultCheck. Static files, no build step for the pages themselves.

## Files

- `index.html`: the eligibility desk. What VaultCheck does, the three DIDs and the vault contract involved, the six check rules with their latest recorded answers (booleans only), the grant scope (check only, 90 days), and the rejection proof for an ungranted call (HTTP 403).
- `dashboard.html`: the traction dashboard. It loads `traction.json` when served over HTTP and falls back to the last generated values when opened as a local file.
- `style.css`: shared styling for both pages.
- `activity.jsonl`: the append only activity log. One JSON object per line. This is the single source the dashboard numbers come from.
- `traction.json`: generated from `activity.jsonl` by `build-traction.mjs`. Do not edit by hand; regenerate it.
- `build-traction.mjs`: the generator. Run `node desk/build-traction.mjs` from the repository root after appending events.

## Where the seeded numbers come from

`activity.jsonl` was seeded only with events recorded in the project STATUS.md and in `flow-run-final.log` (the final clean live run, 2026-11-25T00:42:21Z to 00:42:37Z, plus the first full run that created the organisation and the agent). Each seeded line carries a `source` field naming the record it came from.

Counting rules, enforced by the generator:

- A check counts only when a `check_passed` event with its full answer payload is in the log.
- Credits count only from `agent_funded` and `agent_topup` events that carry a `ledger_seq`.
- Unique DIDs are collected from every DID field in the log, with roles taken from the events that record them.
- If a metric cannot be grounded in a record, it is left out rather than estimated.

## Appending new activity (manual format)

`flow.ts` is a proven live flow and is deliberately left untouched. After each future run, append its events to `activity.jsonl` by hand from the run console output, one JSON object per line, then run `node desk/build-traction.mjs` and commit both files.

Event shapes (all timestamps UTC ISO 8601; use the run start when the exact instant inside a run was not recorded):

```json
{"ts":"2026-11-25T00:42:21Z","run":"final","type":"record_stored","actor_did":"did:t3n:...","contract":"z:...:vault","contract_version":"0.1.0","result":"stored: true"}
{"ts":"2026-11-25T00:42:21Z","run":"final","type":"grant_issued","actor_did":"did:t3n:...","grantee_did":"did:t3n:...","contract":"z:...:vault","contract_version":"0.1.0","contract_id":1151,"function":"check","scopes":[],"valid_from_secs":1795567355,"valid_until_secs":1803343355}
{"ts":"2026-11-25T00:42:21Z","run":"final","type":"agent_topup","from_did":"did:t3n:...","to_did":"did:t3n:...","amount_credits":10,"ledger_seq":24814}
{"ts":"2026-11-25T00:42:21Z","run":"final","type":"check_passed","actor_did":"did:t3n:...","pii_did":"did:t3n:...","contract":"z:...:vault","contract_version":"0.1.0","answers":{"min_age":true}}
{"ts":"2026-11-25T00:42:21Z","run":"final","type":"ungranted_call_rejected","actor_did":"did:t3n:...","contract":"z:...:vault","contract_version":"0.1.0","function":"store","http_status":403,"error":"InvokeError: ..."}
```

Rules for appending:

- Never edit or delete existing lines; the log is append only.
- Never add an event that did not happen in a real run, and never record an answer payload from memory: copy it from the run output.
- Keep the `source` field on seeded or hand copied events when the value came from a file rather than a live console.

## Publishing

GitHub Pages cannot serve a `desk/` folder through branch publishing (only the repository root or `docs/`). This repo therefore ships `.github/workflows/pages.yml`, which deploys the `desk/` folder with the official Pages actions. Publishing needs Pages set to the workflow build type once:

```sh
gh api repos/dunoil/vaultcheck/pages -X POST -f build_type=workflow
```

After that, every push to the default branch that touches `desk/` redeploys the site at https://dunoil.github.io/vaultcheck/.
