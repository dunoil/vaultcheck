use agent_vault_starter::logic::*;

const CUSTOMER: &[u8] = include_bytes!("../examples/customer.json");
const RULES: &[u8] = include_bytes!("../examples/rules.json");
const USER: &[u8] = &[0x11; 20];

/// Midnight UTC on a civil date, as cluster seconds.
fn at(y: i64, m: u32, d: u32) -> u64 {
    let mut days = 0i64;
    while civil_from_days(days) < (y, m, d) {
        days += 1;
    }
    (days * 86_400) as u64
}

fn customer() -> CustomerRecord {
    parse_record(CUSTOMER).expect("example record is valid")
}

fn ask(rules: &str) -> Rules {
    parse_rules(format!(r#"{{"rules":{rules}}}"#).as_bytes()).expect("valid rules")
}

#[test]
fn example_rules_all_pass_for_example_customer() {
    let answers = evaluate(&customer(), &parse_rules(RULES).unwrap(), at(2026, 11, 17)).unwrap();
    assert_eq!(answers.len(), 6);
    assert!(answers.values().all(|ok| *ok), "{answers:?}");
}

#[test]
fn answers_never_contain_a_value() {
    let answers = evaluate(&customer(), &parse_rules(RULES).unwrap(), at(2026, 11, 17)).unwrap();
    let out = serde_json::to_string(&answers).unwrap();
    for value in ["Alex", "1990", "GB82", "452300", "385000", "London", "alex@example.com", "Example Ltd"] {
        assert!(!out.contains(value), "{value} leaked into {out}");
    }
}

#[test]
fn age_turns_on_the_birthday() {
    let rules = ask(r#"{"min_age":36}"#);
    assert!(!evaluate(&customer(), &rules, at(2026, 4, 11)).unwrap()["min_age"]);
    assert!(evaluate(&customer(), &rules, at(2026, 4, 12)).unwrap()["min_age"]);
}

#[test]
fn expired_id_fails() {
    let rules = ask(r#"{"id_not_expired":true}"#);
    assert!(evaluate(&customer(), &rules, at(2031, 4, 11)).unwrap()["id_not_expired"]);
    assert!(!evaluate(&customer(), &rules, at(2031, 4, 12)).unwrap()["id_not_expired"]);
}

#[test]
fn income_below_threshold_fails() {
    let answers = evaluate(&customer(), &ask(r#"{"min_monthly_income_cents":400000}"#), at(2026, 11, 17)).unwrap();
    assert!(!answers["min_monthly_income_cents"]);
}

#[test]
fn account_tenure_counts_whole_months() {
    let rules = ask(r#"{"account_open_min_months":12}"#);
    assert!(!evaluate(&customer(), &rules, at(2020, 6, 2)).unwrap()["account_open_min_months"]);
    assert!(evaluate(&customer(), &rules, at(2020, 6, 3)).unwrap()["account_open_min_months"]);
}

#[test]
fn residency_and_kyc() {
    let mut record = customer();
    record.kyc.status = KycStatus::Pending;
    let answers = evaluate(&record, &ask(r#"{"residency_in":["FR"],"kyc_verified":true}"#), at(2026, 11, 17)).unwrap();
    assert!(!answers["residency_in"]);
    assert!(!answers["kyc_verified"]);
}

#[test]
fn agent_cannot_store_or_forget() {
    assert_eq!(self_only_key(Some(USER), true), Err(VaultError::DelegatedCallerNotAllowed));
    assert_eq!(self_only_key(None, false), Err(VaultError::NoCallingUser));
    assert_eq!(self_only_key(Some(USER), false), Ok(record_key(USER)));
}

#[test]
fn check_reads_only_the_calling_customer() {
    assert_eq!(subject_key(Some(USER)), Ok(b"1111111111111111111111111111111111111111".to_vec()));
    assert_eq!(subject_key(None), Err(VaultError::NoCallingUser));
}

#[test]
fn record_validation() {
    let mut v: serde_json::Value = serde_json::from_slice(CUSTOMER).unwrap();
    v["date_of_birth"] = "12/04/1990".into();
    let err = parse_record(&serde_json::to_vec(&v).unwrap()).unwrap_err();
    assert!(err.to_string().contains("date_of_birth"), "{err}");
    assert!(!err.to_string().contains("12/04/1990"), "error must not echo the value");

    let mut v: serde_json::Value = serde_json::from_slice(CUSTOMER).unwrap();
    v["ssn"] = "123".into();
    assert!(parse_record(&serde_json::to_vec(&v).unwrap()).is_err(), "unknown fields are rejected");
}

#[test]
fn rules_validation() {
    assert!(parse_rules(br#"{"rules":{}}"#).is_err());
    assert!(parse_rules(br#"{"rules":{"kyc_verified":false}}"#).is_err());
    assert!(parse_rules(br#"{"rules":{"residency_in":[]}}"#).is_err());
    assert!(parse_rules(br#"{"rules":{"credit_score":700}}"#).is_err());
}
