# agent-vault-starter

The starter contract for the [Terminal 3 ADK walkthrough](https://docs.terminal3.io/developers/adk/get-started/walkthrough/write-contract).

A customer stores a bank-style record about themselves (name, date of birth, address, ID document,
KYC status, account and income) inside the T3N enclave. An agent the customer has granted can ask
yes/no questions about it ("over 18?", "KYC verified?", "income at least £3,000 a month?") and
gets booleans back. It never sees a value.

| Function | Who may call it | What it does |
|---|---|---|
| `store` | The customer, for themselves | Validates the record and saves it to `z:<tid>:vault` under the customer's DID |
| `check` | The customer, or an agent they granted | Answers the rules asked with `true` / `false` |
| `forget` | The customer, for themselves | Deletes the customer's record |

`examples/customer.json` is a fictional customer; `examples/rules.json` is a `check` input.

## Rules

| Rule | Example | True when |
|---|---|---|
| `min_age` | `18` | The customer is at least this old today |
| `residency_in` | `["GB", "IE"]` | The residential address country is in the list |
| `nationality_in` | `["GB"]` | The nationality is in the list |
| `kyc_verified` | `true` | KYC status is `verified` |
| `id_not_expired` | `true` | The ID document expires today or later |
| `min_balance_cents` | `100000` | The account balance is at least this, in minor units |
| `min_monthly_income_cents` | `300000` | Monthly net income is at least this, in minor units |
| `account_open_min_months` | `12` | The account has been open at least this many whole months |
| `employed` | `true` | Employment status is `employed` or `self_employed` |

The flag rules accept only `true`; leave a rule out to skip it.

## Build and test

```bash
rustup target add wasm32-wasip2
cargo test
cargo build --target wasm32-wasip2 --release
# → target/wasm32-wasip2/release/agent_vault_starter.wasm
```

The host interfaces in `wit/deps/` are vendored from the Trinity release `testnet-v1.0.12`
(`host:interfaces@2.4.0`, `host:tenant@2.0.0`), the imports of the `tenant-base` world. Re-vendor
them from the release you deploy to if it changes.
