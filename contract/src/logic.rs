//! Pure logic for the vault: record validation, caller rules and the yes/no
//! checks. Nothing here touches the host, so it all runs under `cargo test`.

use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use core::fmt;

use serde::{Deserialize, Serialize};

pub const VAULT_MAP_TAIL: &str = "vault";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerRecord {
    pub full_name: String,
    pub date_of_birth: String,
    pub nationality: String,
    pub residential_address: Address,
    pub email: String,
    pub phone: String,
    pub national_id: NationalId,
    pub kyc: Kyc,
    pub account: Account,
    pub employment: Employment,
    pub tax_residency: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Address {
    pub line1: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line2: Option<String>,
    pub city: String,
    pub postcode: String,
    pub country: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NationalId {
    #[serde(rename = "type")]
    pub kind: IdKind,
    pub number: String,
    pub issuing_country: String,
    pub expires_on: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdKind {
    Passport,
    NationalIdCard,
    DrivingLicence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Kyc {
    pub status: KycStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verified_on: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KycStatus {
    Verified,
    Pending,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Account {
    pub iban: String,
    pub sort_code: String,
    pub account_number: String,
    #[serde(rename = "type")]
    pub kind: AccountKind,
    pub currency: String,
    pub opened_on: String,
    pub balance_cents: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountKind {
    Current,
    Savings,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Employment {
    pub status: EmploymentStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub employer: Option<String>,
    pub monthly_net_income_cents: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmploymentStatus {
    Employed,
    SelfEmployed,
    Unemployed,
    Retired,
    Student,
}

/// Each rule is a question. Only the rules present are answered. The flag
/// rules accept only `true`: leave a rule out rather than send `false`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rules {
    pub min_age: Option<u32>,
    pub residency_in: Option<Vec<String>>,
    pub nationality_in: Option<Vec<String>>,
    pub kyc_verified: Option<bool>,
    pub id_not_expired: Option<bool>,
    pub min_balance_cents: Option<i64>,
    pub min_monthly_income_cents: Option<u64>,
    pub account_open_min_months: Option<u32>,
    pub employed: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckInput {
    pub rules: Rules,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultError {
    NoCallingUser,
    DelegatedCallerNotAllowed,
    InvalidInput(String),
    InvalidRecord(String),
    InvalidRules(String),
    NoRecord,
    CorruptRecord,
}

impl fmt::Display for VaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoCallingUser => f.write_str("no calling user: call this contract through an authenticated T3N session"),
            Self::DelegatedCallerNotAllowed => f.write_str("only the customer can do this for themselves; an agent cannot"),
            Self::InvalidInput(e) => write!(f, "invalid input: {e}"),
            Self::InvalidRecord(e) => write!(f, "invalid record: {e}"),
            Self::InvalidRules(e) => write!(f, "invalid rules: {e}"),
            Self::NoRecord => f.write_str("no record stored for this customer"),
            Self::CorruptRecord => f.write_str("stored record could not be read"),
        }
    }
}

/// `store` and `forget`: only the customer, acting for themselves. The record
/// key is their own DID, so nobody can write or delete another customer's row.
pub fn self_only_key(calling_user: Option<&[u8]>, is_delegated: bool) -> Result<Vec<u8>, VaultError> {
    let user = calling_user.ok_or(VaultError::NoCallingUser)?;
    if is_delegated {
        return Err(VaultError::DelegatedCallerNotAllowed);
    }
    Ok(record_key(user))
}

/// `check`: the customer, or an agent they granted. On a delegated call the
/// host sets `calling-user-did` to the customer (`pii_did`), so the agent can
/// only ever reach the record of whoever granted it.
pub fn subject_key(calling_user: Option<&[u8]>) -> Result<Vec<u8>, VaultError> {
    calling_user.map(record_key).ok_or(VaultError::NoCallingUser)
}

pub fn record_key(did: &[u8]) -> Vec<u8> {
    hex::encode(did).into_bytes()
}

pub fn parse_record(bytes: &[u8]) -> Result<CustomerRecord, VaultError> {
    // serde's message can quote the offending value, so it is not passed on.
    let record: CustomerRecord = serde_json::from_slice(bytes)
        .map_err(|e| VaultError::InvalidRecord(format!("not a customer record (line {}, column {})", e.line(), e.column())))?;
    validate_record(&record)?;
    Ok(record)
}

fn validate_record(r: &CustomerRecord) -> Result<(), VaultError> {
    let bad = |field: &str, why: &str| Err(VaultError::InvalidRecord(format!("{field}: {why}")));
    for (field, value) in [("full_name", &r.full_name), ("email", &r.email), ("phone", &r.phone), ("national_id.number", &r.national_id.number)] {
        if value.trim().is_empty() {
            return bad(field, "must not be empty");
        }
    }
    for (field, value) in [
        ("nationality", &r.nationality),
        ("residential_address.country", &r.residential_address.country),
        ("national_id.issuing_country", &r.national_id.issuing_country),
        ("tax_residency", &r.tax_residency),
    ] {
        if !is_country_code(value) {
            return bad(field, "must be a two-letter ISO 3166-1 code, e.g. GB");
        }
    }
    for (field, value) in [
        ("date_of_birth", Some(&r.date_of_birth)),
        ("national_id.expires_on", Some(&r.national_id.expires_on)),
        ("account.opened_on", Some(&r.account.opened_on)),
        ("kyc.verified_on", r.kyc.verified_on.as_ref()),
    ] {
        if let Some(v) = value {
            if parse_date(v).is_none() {
                return bad(field, "must be a date in YYYY-MM-DD form");
            }
        }
    }
    if r.kyc.status == KycStatus::Verified && r.kyc.verified_on.is_none() {
        return bad("kyc.verified_on", "is required when kyc.status is verified");
    }
    if r.account.currency.len() != 3 || !r.account.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return bad("account.currency", "must be a three-letter ISO 4217 code, e.g. GBP");
    }
    Ok(())
}

pub fn parse_rules(bytes: &[u8]) -> Result<Rules, VaultError> {
    let input: CheckInput = serde_json::from_slice(bytes).map_err(|e| VaultError::InvalidInput(e.to_string()))?;
    let r = &input.rules;
    for (name, flag) in [("kyc_verified", r.kyc_verified), ("id_not_expired", r.id_not_expired), ("employed", r.employed)] {
        if flag == Some(false) {
            return Err(VaultError::InvalidRules(format!("{name} accepts only true; leave it out to skip it")));
        }
    }
    for (name, list) in [("residency_in", &r.residency_in), ("nationality_in", &r.nationality_in)] {
        if let Some(list) = list {
            if list.is_empty() || !list.iter().all(|c| is_country_code(c)) {
                return Err(VaultError::InvalidRules(format!("{name} must be a non-empty list of two-letter country codes")));
            }
        }
    }
    if *r == Rules::default() {
        return Err(VaultError::InvalidRules("ask at least one rule".to_string()));
    }
    Ok(input.rules)
}

/// One boolean per rule asked, keyed by the rule's name. Never a value.
pub fn evaluate(r: &CustomerRecord, rules: &Rules, now_secs: u64) -> Result<BTreeMap<&'static str, bool>, VaultError> {
    let today = civil_from_days((now_secs / 86_400) as i64);
    let date = |s: &str| parse_date(s).ok_or(VaultError::CorruptRecord);
    let mut out = BTreeMap::new();

    if let Some(min) = rules.min_age {
        out.insert("min_age", age_years(date(&r.date_of_birth)?, today) >= i64::from(min));
    }
    if let Some(list) = &rules.residency_in {
        out.insert("residency_in", list.iter().any(|c| *c == r.residential_address.country));
    }
    if let Some(list) = &rules.nationality_in {
        out.insert("nationality_in", list.iter().any(|c| *c == r.nationality));
    }
    if rules.kyc_verified.is_some() {
        out.insert("kyc_verified", r.kyc.status == KycStatus::Verified);
    }
    if rules.id_not_expired.is_some() {
        out.insert("id_not_expired", date(&r.national_id.expires_on)? >= today);
    }
    if let Some(min) = rules.min_balance_cents {
        out.insert("min_balance_cents", r.account.balance_cents >= min);
    }
    if let Some(min) = rules.min_monthly_income_cents {
        out.insert("min_monthly_income_cents", r.employment.monthly_net_income_cents >= min);
    }
    if let Some(min) = rules.account_open_min_months {
        out.insert("account_open_min_months", whole_months(date(&r.account.opened_on)?, today) >= i64::from(min));
    }
    if rules.employed.is_some() {
        out.insert(
            "employed",
            matches!(r.employment.status, EmploymentStatus::Employed | EmploymentStatus::SelfEmployed),
        );
    }
    Ok(out)
}

fn is_country_code(s: &str) -> bool {
    s.len() == 2 && s.bytes().all(|b| b.is_ascii_uppercase())
}

pub type Date = (i64, u32, u32);

pub fn parse_date(s: &str) -> Option<Date> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let m: u32 = s[5..7].parse().ok()?;
    let d: u32 = s[8..10].parse().ok()?;
    if !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return None;
    }
    Some((y, m, d))
}

fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
pub fn civil_from_days(z: i64) -> Date {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

pub fn age_years(birth: Date, on: Date) -> i64 {
    let mut age = on.0 - birth.0;
    if (on.1, on.2) < (birth.1, birth.2) {
        age -= 1;
    }
    age
}

pub fn whole_months(from: Date, to: Date) -> i64 {
    let mut months = (to.0 - from.0) * 12 + i64::from(to.1) - i64::from(from.1);
    if to.2 < from.2 {
        months -= 1;
    }
    months
}
