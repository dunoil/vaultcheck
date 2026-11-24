# VaultCheck

A privacy first eligibility agent built on the Terminal 3 Developer Platform (T3N).

VaultCheck answers yes or no eligibility questions about a person without ever seeing that person's private data. The person stores their own record once inside a Terminal 3 TEE vault contract. They grant the VaultCheck agent exactly one function, check. A hiring desk, payout desk, or onboarding flow can then ask questions like: is this person ID verified, over 18, resident in a supported country, above an income floor. The agent returns only booleans. It has no function that can read, change, or export the record, and calls to any other function are rejected by the grant.

Built for the Terminal 3 Build+Scale Agent Micro Grant on DoraHacks (deadline 24 Dec 2026).

## How it works

1. Claim a free T3N API key and test credits from the Terminal 3 claim page (self serve, shown once, keep it in your shell environment only).
2. Run the quickstart to authenticate and get your did:t3n identity.
3. Build the vault contract from the official agent-vault-starter reference (Rust, compiled to a wasm32-wasip2 component) and register it under your tenant.
4. As the customer: store your record with the store function.
5. As the customer: grant the agent the check function only, using member delegation.
6. As the agent: invoke check with a set of rules and receive one boolean per rule. The agent is billed from its own credit balance.

## Layout

- quickstart.ts: first authenticated call, prints your did:t3n value.
- contract: the vault TEE contract (from the Terminal 3 agent-vault-starter reference, adapted for VaultCheck).
- desk: the eligibility desk service and page (in progress).

## Status

Work in progress. Setup, verification notes, and the traction dashboard will be updated here as real usage happens. No usage numbers are claimed until they come from real logs.
