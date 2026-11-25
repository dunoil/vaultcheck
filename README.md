# VaultCheck

VaultCheck is a privacy first eligibility agent built on the Terminal 3 Developer Platform (T3N). A person stores their private record once inside a TEE vault contract and grants an agent exactly one function, `check`. Anyone with a legitimate need to know, such as a hiring desk, a payout desk, or an onboarding flow, can then ask yes or no questions (ID verified? over 18? resident in a supported country? above an income floor?) and receives one boolean per rule. The agent never receives the underlying values, it has no function that can read, change, or export the record, and any call outside its grant is rejected by the node before the contract runs.

Built for the Terminal 3 Build+Scale Agent Micro Grant on DoraHacks (deadline 24 Dec 2026 23:59 UTC+8). The BUIDL is submitted and under review.

## Live links

- Eligibility desk: https://dunoil.github.io/vaultcheck/
- Traction dashboard: https://dunoil.github.io/vaultcheck/dashboard.html
- Try it yourself guide: https://dunoil.github.io/vaultcheck/try.html
- Demo video (2:13, recorded from real testnet runs): https://youtu.be/YHL9_15fRVo
- DoraHacks BUIDL: https://dorahacks.io/build/51837

## How it works

1. **Vault.** The customer stores their record once, through the vault contract, into a private data map whose only reader and writer is the contract itself. The record stays inside the enclave.
2. **Grant.** Through member delegation (`updateMemberDelegation`), the customer grants the agent exactly one function, `check`, with no scopes. The platform default window applies: 90 days. The grant is read back with `getMemberDelegation`, so what is shown is what the platform itself reports.
3. **Check.** The agent is an org owned agent created with `createAgent`. It invokes `check` statelessly with `pii_did` naming the customer, plus a set of rules, and gets back one boolean per rule and nothing else. Check calls are billed to the agent's own credit balance.
4. **Rejection.** A call to any function the agent was not granted, for example `store`, is refused by the node with HTTP 403 before the contract runs. This is proven live in the recorded flow, in the same run and with the same agent balance as a successful check, so the rejection is a grant decision and not a funding failure.

One platform behaviour worth knowing: a bare 403 on a granted call can also mean the agent is out of credit. The scripts here top the agent up with 10 credits and retry once on a 403 from the granted check.

## Prerequisites

- A free Terminal 3 developer key from https://www.terminal3.io/claim-page (sign in with Google, key shown once, comes with free testnet credits). Keep it in your shell environment or a local `.env` file only. Never commit it.
- Node 20 or newer and git.
- Only for building the contract WASM yourself: a Rust toolchain with the `wasm32-wasip2` target (`rustup target add wasm32-wasip2`).

## Quickstart: the recorded demo flow

These are the scripts behind the demo video and the dashboard evidence.

```sh
git clone https://github.com/dunoil/vaultcheck.git
cd vaultcheck
npm install

# 1. Authenticate and print your did:t3n identity
T3N_API_KEY=<your key> npx tsx quickstart.ts

# 2. Build the vault contract and register it, then create the private map
cd contract && cargo build --release --target wasm32-wasip2 && cd ..
T3N_API_KEY=<your key> npx tsx register.ts
# Save the contract_id register prints. It is shown only once.

# 3. Run the full flow: store, grant check only, agent check, rejection proof
# (flow.ts expects the developer key plus the saved org agent values in the env)
set -a; . ../path/to/your/secrets.env; set +a
npx tsx flow.ts
```

- `quickstart.ts`: first authenticated call, prints your DID.
- `register.ts`: registers the vault WASM contract (tail `vault`, version `0.1.0`) and creates the private vault map limited to the contract.
- `flow.ts`: the proven end to end flow. It creates an organisation and an org owned agent with `createAgent`, funds the agent, stores the sample record, grants `check` only, runs the agent check, and demonstrates the ungranted call rejection. Note: a second key from the claim page is a second credential of the same account, not a distinct agent; `flow.ts` documents this and uses the org agent pattern from the official walkthrough.

## Try it yourself

`try.ts` packages the whole pattern for a brand new developer. With your own key in a local `.env` file:

```sh
set -a; . ./.env; set +a
npx tsx try.ts
```

It registers your own copy of the contract under your DID, creates the private map, stores the fictional sample record from `contract/examples/customer.json`, creates your organisation and agent, grants `check` only, runs the check with `contract/examples/rules.json`, and attempts the ungranted call so you can see the rejection. At the end it prints a summary line with your DID and contract.

The guided version, with what success looks like, troubleshooting, and key safety notes, is the [try page](https://dunoil.github.io/vaultcheck/try.html). To be counted as a verified external user on the traction dashboard, open a GitHub issue on this repository with your summary line (DID plus contract, never your key). We verify it, then record your run in the public activity log as an external onboarding completion.

## Evidence

Every figure below comes from recorded live runs on Terminal 3 testnet, logged in `docs/activity.jsonl` and summarised on the [traction dashboard](https://dunoil.github.io/vaultcheck/dashboard.html). Nothing is estimated.

- Contract `z:f93478979727f0f1d3d3f7155232e44e908872af:vault`, contract_id 1151, version 0.1.0, registered live on 25 Nov 2026.
- 5 unique DIDs recorded so far, all internal (see Traction below). 2 documented checks passed with full answer payloads, the latest answering all six rules true: `{"answers":{"account_open_min_months":true,"id_not_expired":true,"kyc_verified":true,"min_age":true,"min_monthly_income_cents":true,"residency_in":true}}`.
- 2 ungranted calls rejected with HTTP 403. 2 records stored. 40 credits moved to agents across 5 recorded ledger transfers (seq 24792, 24802, 24808, 24814, 24820).
- Grant read back from the platform: function `check` only, scopes none, window exactly 90 days.
- The full final demo run is preserved in `flow-run-final.log` in this repository.

## Security model

- The agent's authority is a single function grant on a single contract, issued by the record owner and revocable through the same delegation mechanism. Least privilege is enforced by the node, not by the agent's good behaviour.
- The vault map is private, with readers and writers limited to the contract itself. The contract's `check` function returns booleans computed inside the enclave; there is no code path that returns record values to the agent.
- The sample record in `contract/examples/customer.json` is fictional (Alex Example). No real person's data is used anywhere in this project.
- API keys are read from the environment only and are never printed, logged, or committed. The agent's one time key in the demo flow is saved only in a secrets file outside this repository.

## Traction: internal versus external

Traction for this grant is measured by credits consumed across unique DIDs, so the dashboard counts DIDs carefully and honestly:

- **Internal DIDs** are the project itself: our developer account, our organisations, and our agents, including every test run made with our own keys. They prove the system works; they are not adoption.
- **External DIDs** are independent users who ran the flow under their own key and reported a verifiable result. An external DID enters the log only after the reported DID and contract are verified, via the GitHub issue flow described above.
- The dashboard also reports onboarding completions, checks passed, rejected ungranted calls, records stored, credits moved to agents, and repeat usage (DIDs active on more than one UTC day), each counted only from recorded events.

Current state: 5 internal DIDs, 0 external DIDs, 1 internal onboarding completion (the `try.ts` self test). The gap between those numbers is exactly what this phase of the project is working to close, with real users only.

## Layout

- `quickstart.ts`, `register.ts`, `flow.ts`: the recorded demo flow.
- `try.ts`: the self serve onboarding script.
- `contract/`: the vault TEE contract (from the Terminal 3 agent-vault-starter reference, adapted for VaultCheck), with fictional examples in `contract/examples/`.
- `docs/`: the eligibility desk, the try guide, and the traction dashboard, served by GitHub Pages.
