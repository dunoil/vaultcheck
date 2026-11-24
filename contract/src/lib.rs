//! `z:<tenant>:vault` — a private customer vault. The customer stores a
//! bank-style record about themselves; an agent they grant can ask yes/no
//! questions about it and never sees a value.
//!
//! Map (create it before first use, read/write for this contract only):
//! - `vault`: `hex(customer DID)` → the customer's record as JSON.

extern crate alloc;

pub mod logic;

#[cfg(target_arch = "wasm32")]
mod guest {
    use alloc::format;
    use alloc::string::{String, ToString};
    use alloc::vec::Vec;

    use serde_json::json;

    use super::logic::{self, VaultError};

    wit_bindgen::generate!({
        world: "agent-vault",
        path: "wit",
        generate_all,
    });

    use exports::z::agent_vault::contracts::{GenericInput, Guest};
    use host::interfaces::{kv_store, logging};
    use host::tenant::tenant_context;

    fn vault_map() -> String {
        format!("z:{}:{}", hex::encode(tenant_context::tenant_did()), logic::VAULT_MAP_TAIL)
    }

    fn input(req: &GenericInput) -> Result<&[u8], String> {
        req.input.as_deref().ok_or_else(|| VaultError::InvalidInput("missing input".to_string()).to_string())
    }

    fn reply(value: serde_json::Value) -> Result<Vec<u8>, String> {
        serde_json::to_vec(&value).map_err(|e| e.to_string())
    }

    struct Component;

    impl Guest for Component {
        fn store(req: GenericInput) -> Result<Vec<u8>, String> {
            let key = logic::self_only_key(tenant_context::calling_user_did().as_deref(), tenant_context::is_delegated())
                .map_err(|e| e.to_string())?;
            let record = logic::parse_record(input(&req)?).map_err(|e| e.to_string())?;
            let bytes = serde_json::to_vec(&record).map_err(|e| e.to_string())?;
            kv_store::put(&vault_map(), &key, &bytes)?;
            // Never log a value, only that something happened.
            logging::info("store: customer record saved")?;
            reply(json!({ "stored": true, "custom": { "vault_op": "store" } }))
        }

        fn check(req: GenericInput) -> Result<Vec<u8>, String> {
            let key = logic::subject_key(tenant_context::calling_user_did().as_deref()).map_err(|e| e.to_string())?;
            let rules = logic::parse_rules(input(&req)?).map_err(|e| e.to_string())?;
            let bytes = kv_store::get(&vault_map(), &key)?.ok_or_else(|| VaultError::NoRecord.to_string())?;
            let record: logic::CustomerRecord =
                serde_json::from_slice(&bytes).map_err(|_| VaultError::CorruptRecord.to_string())?;
            let answers = logic::evaluate(&record, &rules, tenant_context::cluster_timestamp_secs())
                .map_err(|e| e.to_string())?;
            let all_passed = answers.values().all(|ok| *ok);
            // `custom` is lifted off the response by the node and stored as
            // labels on this call's activity-log entry.
            reply(json!({
                "answers": answers,
                "custom": {
                    "vault_op": "check",
                    "rules_asked": answers.len().to_string(),
                    "all_passed": all_passed.to_string(),
                },
            }))
        }

        fn forget(_req: GenericInput) -> Result<Vec<u8>, String> {
            let key = logic::self_only_key(tenant_context::calling_user_did().as_deref(), tenant_context::is_delegated())
                .map_err(|e| e.to_string())?;
            let deleted = kv_store::delete(&vault_map(), &key)?;
            logging::info("forget: customer record deleted")?;
            reply(json!({ "deleted": deleted, "custom": { "vault_op": "forget" } }))
        }
    }

    export!(Component);
}
