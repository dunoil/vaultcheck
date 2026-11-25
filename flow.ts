// VaultCheck live flow on Terminal 3 testnet.
//
// Roles (per the official ADK walkthrough, step "Store, grant and check"):
// - The customer/developer: one key (T3N_API_KEY). Stores the record and
//   grants the agent one function.
// - The agent: an org-owned agent created through the developer's
//   organisation (createAgent). It gets its own DID and a one-time opaque
//   API key, and calls the contract statelessly via invoke() with pii_did
//   naming the customer it acts for. The claimed second key
//   (T3N_AGENT_API_KEY) is a second credential of the same account, so it
//   resolves to the same DID as the developer key; step 1 records that,
//   and the org agent below is the distinct agent identity for the
//   delegated calls.
//
// Run with the secrets env file sourced:
//   set -a; . ../.secrets/t3n.env; set +a; npx tsx flow.ts
// Keys are read from the environment only and are never printed. When the
// org agent is first created, its one-time API key is appended to the
// secrets env file (outside this repo) as T3N_ORG_AGENT_API_KEY, with
// T3N_ORG_DID and T3N_AGENT_DID, so later runs reuse the same agent.

import { readFile, appendFile } from "node:fs/promises";
import {
  T3nClient,
  TenantClient,
  getNodeUrl,
  setEnvironment,
  loadWasmComponent,
  resolveTrustAnchor,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  invoke,
  discoverWhoami,
  toBaseUnits,
  type BoundGrant,
} from "@terminal3/t3n-sdk";

const DEV_KEY = process.env.T3N_API_KEY;
const CLAIMED_AGENT_KEY = process.env.T3N_AGENT_API_KEY;
const CONTRACT_NAME =
  process.env.T3N_CONTRACT ?? "z:f93478979727f0f1d3d3f7155232e44e908872af:vault";
const CONTRACT_VERSION = "0.1.0";
const CONTRACT_TAIL = "vault";
const SECRETS_PATH = new URL("../.secrets/t3n.env", import.meta.url).pathname;

if (!DEV_KEY || !CLAIMED_AGENT_KEY) {
  console.error("T3N_API_KEY and T3N_AGENT_API_KEY must be set (source the secrets env file).");
  process.exit(1);
}

setEnvironment("testnet");

function stamp(): string {
  return new Date().toISOString();
}

async function makeClient(apiKey: string) {
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(apiKey);
  const t3n = new T3nClient({
    trustAnchor: await resolveTrustAnchor("testnet"),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
  });
  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  return { t3n, did: did.value as string };
}

console.log("=== VaultCheck live flow ===");
console.log("Started:", stamp());
console.log("Contract:", CONTRACT_NAME, "version", CONTRACT_VERSION);

// Step 0: developer/customer session (the one key from the claim page).
const dev = await makeClient(DEV_KEY);
const customerDid = dev.did;
console.log("\n[0] Developer/customer session authenticated. DID:", customerDid);

// Step 1: authenticate the claimed agent key and record the DID it
// resolves to. Also probe the stateless whoami read with it.
const claimed = await makeClient(CLAIMED_AGENT_KEY);
console.log("\n[1] Claimed agent key session authenticated. DID it resolves to:", claimed.did);
try {
  const w = await discoverWhoami({ apiKey: CLAIMED_AGENT_KEY, baseUrl: getNodeUrl() });
  console.log("    discoverWhoami (stateless) for the claimed agent key:", w.did);
} catch (err) {
  console.log(
    "    discoverWhoami (stateless) for the claimed agent key failed:",
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
}

// Step 2: the org agent. Reuse the saved one when present; otherwise
// create the organisation and the agent, fund the agent with 5 credits
// from the developer balance, and save the one-time key to the secrets
// file (never printed).
let orgDid = process.env.T3N_ORG_DID;
let agentDid = process.env.T3N_AGENT_DID;
let agentApiKey = process.env.T3N_ORG_AGENT_API_KEY;
if (orgDid && agentDid && agentApiKey) {
  console.log("\n[2] Reusing saved org agent. Org DID:", orgDid, "| Agent DID:", agentDid);
} else {
  orgDid = (await dev.t3n.createOrganisation("VaultCheck")).value;
  console.log("\n[2] Organisation created. Org DID:", orgDid);
  const created = await dev.t3n.createAgent(orgDid, "VaultCheck Agent");
  agentDid = created.agentDid.value;
  agentApiKey = created.apiKey;
  console.log("    Agent created. Agent DID:", agentDid, "| keyId:", created.keyId);
  const fund = await dev.t3n.fundAgent(agentDid, toBaseUnits(5));
  console.log("    Agent funded with 5 credits from the developer balance. Ledger seq:", fund.seqNo);
  await appendFile(
    SECRETS_PATH,
    `\nT3N_ORG_DID=${orgDid}\nT3N_AGENT_DID=${agentDid}\nT3N_ORG_AGENT_API_KEY=${agentApiKey}\n`,
  );
  console.log("    Agent API key saved to the secrets env file (outside the repo, not printed).");
}
if (!orgDid || !agentDid || !agentApiKey) {
  console.error("Org agent identity is incomplete; aborting.");
  process.exit(1);
}
const agentKey: string = agentApiKey;
const agentWhoami = await discoverWhoami({ apiKey: agentApiKey, baseUrl: getNodeUrl() });
console.log("    discoverWhoami for the org agent key resolves to:", agentWhoami.did);

// Step 3: as the customer, store the example record via the contract.
const customer = JSON.parse(
  await readFile(new URL("./contract/examples/customer.json", import.meta.url), "utf8"),
);
const tenant = new TenantClient({ t3n: dev.t3n, baseUrl: getNodeUrl(), tenantDid: customerDid });
const storeResult = await tenant.contracts.execute(CONTRACT_TAIL, {
  version: CONTRACT_VERSION,
  functionName: "store",
  input: customer,
});
console.log("\n[3] Customer stored the example record (Alex Example, fictional).");
console.log("    store result:", JSON.stringify(storeResult));

// Step 4: grant the agent ONLY the check function (member delegation).
// No validity window is set, so the default applies: grants expire after
// 90 days per the walkthrough.
const grant: BoundGrant = {
  grantee: agentDid,
  contract_id: CONTRACT_NAME,
  function: "check",
  scopes: [],
};
const preserved = await dev.t3n.updateMemberDelegation(grant);
console.log("\n[4] Member delegation grant written via updateMemberDelegation:");
console.log("    grantee (agent):", grant.grantee);
console.log("    contract:", grant.contract_id);
console.log("    function:", grant.function, "(only this function)");
console.log("    preserved rows from the existing policy:", JSON.stringify(preserved.preservedRows));
const doc = await dev.t3n.getMemberDelegation();
const mine = doc.grants.filter((g) => g.grantee === agentDid);
console.log("    Read back from getMemberDelegation:", JSON.stringify(mine));

// Step 5: the agent invokes check for the customer (delegated call).
const rules = JSON.parse(
  await readFile(new URL("./contract/examples/rules.json", import.meta.url), "utf8"),
);
async function agentInvoke(functionName: string, input: unknown) {
  return invoke({
    apiKey: agentKey,
    baseUrl: getNodeUrl(),
    request: {
      contract_id: CONTRACT_NAME,
      contract_version: CONTRACT_VERSION,
      function_name: functionName,
      pii_did: customerDid,
      input,
    },
  });
}
// A bare 403 on the granted call can also mean the agent ran out of
// credit (the walkthrough calls this out), so on a 403 the agent is
// topped up with 10 credits from the developer balance and the call is
// retried once. The successful check here is also what makes the step 6
// rejection unambiguous: the agent demonstrably has credit there.
console.log("\n[5] Agent invoked check for the customer with rules:", JSON.stringify(rules.rules));
let checkResult: unknown;
try {
  checkResult = await agentInvoke("check", rules);
} catch (err) {
  const status = (err as { status?: number }).status;
  if (status !== 403) throw err;
  console.log("    First check attempt returned 403; topping the agent up with 10 credits and retrying:");
  const fund = await dev.t3n.fundAgent(agentDid, toBaseUnits(10));
  console.log("    top-up ledger seq:", fund.seqNo);
  checkResult = await agentInvoke("check", rules);
}
console.log("    check result:", JSON.stringify(checkResult));

// Step 6: negative proof. The agent invokes store, which it was NOT
// granted. The node should refuse before the contract runs (InvokeError
// with status 403 per the walkthrough).
console.log("\n[6] Agent invoking store (NOT granted), expecting rejection:");
let rejection: string;
try {
  const bad = await agentInvoke("store", customer);
  rejection = "call returned without throwing: " + JSON.stringify(bad);
} catch (err) {
  const status = (err as { status?: number }).status;
  rejection =
    (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) +
    (status !== undefined ? ` (status ${status})` : "");
}
console.log("    rejection:", rejection);

console.log("\n=== Summary ===");
console.log("Customer/developer DID:", customerDid);
console.log("Claimed agent key resolves to DID:", claimed.did);
console.log("Org DID:", orgDid);
console.log("Agent DID:", agentDid);
console.log("Stored: example customer record via store, result:", JSON.stringify(storeResult));
console.log("Grant: agent holds only function 'check' on", CONTRACT_NAME);
console.log("Check result:", JSON.stringify(checkResult));
console.log("Ungranted store rejection:", rejection);
console.log("Finished:", stamp());
