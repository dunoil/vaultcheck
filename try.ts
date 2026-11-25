// VaultCheck self serve onboarding: try the whole pattern under your own DID.
//
// One command, one key of your own:
//   1. Claim a free Terminal 3 developer key (Google sign in) at
//      https://www.terminal3.io/claim-page and put it in a local .env file
//      as T3N_API_KEY, or export it in your shell. Never commit the key.
//   2. Run:  npx tsx try.ts
//      No Rust toolchain is needed. If no local contract build exists, the
//      script downloads the prebuilt vault contract from the VaultCheck
//      GitHub release v0.1.0 automatically. A local build, or a file named
//      by T3N_WASM_PATH, is used in preference to the download.
//   Run "npx tsx try.ts --help" for the full usage text.
//
// What happens, all on Terminal 3 testnet under your own identity:
//   step 1  authenticate and print your DID
//   step 2  register your own copy of the vault contract
//   step 3  create the private vault data map, readable only by the contract
//   step 4  store the fictional sample record from contract/examples
//   step 5  create an organisation and an agent, fund the agent
//   step 6  grant the agent exactly one function: check
//   step 7  the agent runs the check and prints one boolean per rule
//   step 8  the agent tries an ungranted call and gets rejected
//
// At the end you get a summary line with your DID and contract. Paste that
// line into a GitHub issue on https://github.com/dunoil/vaultcheck/issues
// and your run is verified and counted as an external VaultCheck user on
// the public traction dashboard. Keys are read from the environment only
// and are never printed.

import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

const HELP = `VaultCheck onboarding: run the whole pattern under your own Terminal 3 DID.

Usage:
  npx tsx try.ts            run the onboarding (8 printed steps)
  npx tsx try.ts --help     show this text

Before you run:
  1. Claim a free Terminal 3 developer key at https://www.terminal3.io/claim-page
     (sign in with Google; the key is shown once and includes testnet credits).
  2. Make the key available to the script, either by exporting it:
       export T3N_API_KEY=<your key>
     or by putting it in a local .env file and loading it:
       set -a; . ./.env; set +a
     Never commit the key to git, and never paste it into an issue or a chat.
  3. That is all. Node 20 or newer is the only other requirement.

The vault contract WASM, in order of preference:
  a. T3N_WASM_PATH, if you set it to an existing build.
  b. A local build at contract/target/wasm32-wasip2/release/agent_vault_starter.wasm.
  c. An automatic download of the prebuilt contract from the VaultCheck
     GitHub release v0.1.0. The download is checked against the WASM file
     header and saved to the local build path, so later runs reuse it.
  Building it yourself with cargo is only needed if the download is
  unavailable: rustup target add wasm32-wasip2, then
  cargo build --release --target wasm32-wasip2 inside contract/.

What the run does, all on Terminal 3 testnet under your own identity:
  registers your own vault contract, creates its private data map, stores
  the fictional sample record, creates an organisation and an agent, grants
  the agent exactly one function (check), runs the check so you see one
  boolean per rule, and shows an ungranted call being rejected (HTTP 403).
  It funds the agent from your testnet balance (5 credits, plus a 10 credit
  top up only if the check needs it).

At the end, copy the share back line from the summary into a GitHub issue
at https://github.com/dunoil/vaultcheck/issues and your run is verified
and counted as an external user on the public traction dashboard.
Guide: https://dunoil.github.io/vaultcheck/try.html`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const API_KEY = process.env.T3N_API_KEY;
if (!API_KEY) {
  console.error("T3N_API_KEY is not set, so there is no identity to run under.");
  console.error("Likely cause: the key was not exported, or the .env file was not loaded in this terminal.");
  console.error("Fix: claim a free key at https://www.terminal3.io/claim-page (Google sign in, shown once),");
  console.error("then export it with: export T3N_API_KEY=<your key>");
  console.error("or load your local .env file with: set -a; . ./.env; set +a");
  console.error("Never commit the key to git. Full guide: npx tsx try.ts --help");
  process.exit(1);
}

const DEFAULT_WASM_PATH = new URL(
  "./contract/target/wasm32-wasip2/release/agent_vault_starter.wasm",
  import.meta.url,
).pathname;
const RELEASE_WASM_URL =
  "https://github.com/dunoil/vaultcheck/releases/download/v0.1.0/agent_vault_starter.wasm";
const CONTRACT_TAIL = "vault";
const CONTRACT_VERSION = "0.1.0";

setEnvironment("testnet");

function step(n: number, text: string) {
  console.log(`\n[Step ${n}] ${text}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Resolve the vault contract WASM without requiring a Rust toolchain:
// explicit T3N_WASM_PATH first, then a local build, then an automatic
// download of the prebuilt contract from the GitHub release. Only when
// all three fail do we point at the cargo build as the fallback.
async function ensureWasm(): Promise<string> {
  const explicit = process.env.T3N_WASM_PATH;
  if (explicit) {
    if (await fileExists(explicit)) {
      console.log("    Using the WASM named by T3N_WASM_PATH:", explicit);
      return explicit;
    }
    console.error(`    T3N_WASM_PATH is set to ${explicit}, but no file exists there.`);
    console.error("    Fix: point T3N_WASM_PATH at an existing agent_vault_starter.wasm build, or unset it");
    console.error("    and run again to use the local build or the automatic download.");
    process.exit(1);
  }
  if (await fileExists(DEFAULT_WASM_PATH)) {
    console.log("    Using the local contract build:", DEFAULT_WASM_PATH);
    return DEFAULT_WASM_PATH;
  }
  console.log("    No local contract build found, so no Rust toolchain is needed:");
  console.log("    downloading the prebuilt vault contract from the VaultCheck GitHub release v0.1.0:");
  console.log("   ", RELEASE_WASM_URL);
  try {
    const res = await fetch(RELEASE_WASM_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`the release server answered HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isWasm =
      bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
    if (!isWasm) throw new Error("the downloaded file does not start with the WASM header");
    await mkdir(dirname(DEFAULT_WASM_PATH), { recursive: true });
    await writeFile(DEFAULT_WASM_PATH, bytes);
    console.log(`    Downloaded ${bytes.length} bytes and saved them to the local build path for reuse.`);
    return DEFAULT_WASM_PATH;
  } catch (err) {
    console.error("    The automatic download failed:", err instanceof Error ? err.message : String(err));
    console.error("    Likely cause: no internet connection, or the release asset could not be reached.");
    console.error("    Fallback: build the contract yourself, then run try.ts again:");
    console.error("      rustup target add wasm32-wasip2");
    console.error("      cd contract && cargo build --release --target wasm32-wasip2 && cd ..");
    console.error("    Or download agent_vault_starter.wasm from the release page manually and set");
    console.error("    T3N_WASM_PATH to its location: https://github.com/dunoil/vaultcheck/releases/tag/v0.1.0");
    process.exit(1);
  }
}

// Turn an unexpected failure into a short diagnosis instead of a bare
// stack trace. The known failure modes get their likely cause and fix.
function reportFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  console.error("\nVaultCheck onboarding stopped before finishing.");
  console.error("Error:", message);
  if (status === 403 || message.includes("403")) {
    console.error("Likely cause: a 403 from the node. On a granted call this usually means the agent is out");
    console.error("of testnet credit (the granted check in this script already tops up 10 credits and retries");
    console.error("once). On any other call it means the function was not granted.");
    console.error("Fix: check your testnet credit balance on the Terminal 3 developer dashboard, claim more");
    console.error("test credits if it is empty, then run try.ts again. A repeat run reuses your contract.");
  } else if (message.toLowerCase().includes("not higher than current version")) {
    console.error("Likely cause: this DID already registered the vault contract in an earlier run.");
    console.error("Fix: none needed in most cases, the script normally detects this and continues. If it");
    console.error("keeps happening, open an issue with the output above (never include your key).");
  } else if (
    message.toLowerCase().includes("fetch failed") ||
    message.toLowerCase().includes("enotfound") ||
    message.toLowerCase().includes("econn")
  ) {
    console.error("Likely cause: the Terminal 3 node or GitHub could not be reached from this machine.");
    console.error("Fix: check your internet connection and any proxy settings, then run try.ts again.");
  } else {
    console.error("If the cause is not obvious, compare the step that failed with the troubleshooting table");
    console.error("on the guide page: https://dunoil.github.io/vaultcheck/try.html");
    console.error("You can also open an issue with the output above (never include your key).");
  }
}

try {
  console.log("=== VaultCheck: try it under your own DID ===");
  console.log("Network: Terminal 3 testnet. Your key stays in your environment and is never printed.");

  // Step 1: authenticate and show the caller's own DID.
  step(1, "Authenticating with your Terminal 3 key.");
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(API_KEY);
  const t3n = new T3nClient({
    trustAnchor: await resolveTrustAnchor("testnet"),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, API_KEY) },
  });
  await t3n.handshake();
  const didResult = await t3n.authenticate(createEthAuthInput(address));
  const myDid = didResult.value as string;
  console.log("    Your DID:", myDid);

  const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid: myDid });
  await tenant.tenant.me();

  // Step 2: register your own copy of the vault contract from the repo WASM.
  // If this DID already registered it (a repeat run), keep going with the
  // contract name derived from the DID, which is the name register returns.
  step(2, "Registering your vault contract from the repo WASM.");
  const wasmPath = await ensureWasm();
  let contractName: string;
  let contractId: number | null = null;
  try {
    const wasm = await readFile(wasmPath);
    const result = await tenant.contracts.register({
      tail: CONTRACT_TAIL,
      version: CONTRACT_VERSION,
      wasm,
    });
    contractName = result.name;
    contractId = result.contract_id;
    console.log("    Registered:", contractName, "contract_id:", contractId);
    console.log("    Note: contract_id is shown only at registration. The summary line at the end carries it.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes("already") || lower.includes("not higher than current version")) {
      contractName = `z:${myDid.replace("did:t3n:", "")}:${CONTRACT_TAIL}`;
      console.log("    This DID already registered a vault contract; continuing with:", contractName);
    } else {
      throw err;
    }
  }

  // Step 3: create the private vault map, access limited to the contract.
  step(3, "Creating the private vault data map (readers and writers: the contract only).");
  if (contractId !== null) {
    try {
      await tenant.maps.create({
        tail: "vault",
        visibility: "private",
        readers: { only: [contractId] },
        writers: { only: [contractId] },
      });
      console.log("    Vault map created.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("already exists")) {
        await tenant.maps.update("vault", {
          readers: { only: [contractId] },
          writers: { only: [contractId] },
        });
        console.log("    Vault map already existed, ACL updated to this contract_id.");
      } else {
        throw err;
      }
    }
  } else {
    console.log("    Skipped: no new contract_id on a repeat run, the existing map ACL already points at your contract.");
  }

  // Step 4: store the fictional sample record.
  step(4, "Storing the sample record (Alex Example, fictional, from contract/examples/customer.json).");
  const customer = JSON.parse(
    await readFile(new URL("./contract/examples/customer.json", import.meta.url), "utf8"),
  );
  const storeResult = await tenant.contracts.execute(CONTRACT_TAIL, {
    version: CONTRACT_VERSION,
    functionName: "store",
    input: customer,
  });
  console.log("    store result:", JSON.stringify(storeResult));

  // Step 5: create an organisation and its agent, fund the agent.
  step(5, "Creating an organisation and an agent, and funding the agent with 5 credits.");
  const orgDid = (await t3n.createOrganisation("VaultCheck")).value;
  console.log("    Organisation DID:", orgDid);
  const created = await t3n.createAgent(orgDid, "VaultCheck Agent");
  const agentDid = created.agentDid.value;
  const agentApiKey = created.apiKey;
  console.log("    Agent DID:", agentDid, "| keyId:", created.keyId);
  console.log("    The agent one-time API key is held in memory for this run only and is never printed.");
  const fund = await t3n.fundAgent(agentDid, toBaseUnits(5));
  console.log("    Agent funded with 5 credits from your balance. Ledger seq:", fund.seqNo);
  const agentWhoami = await discoverWhoami({ apiKey: agentApiKey, baseUrl: getNodeUrl() });
  console.log("    Agent key resolves to:", agentWhoami.did);

  // Step 6: grant the agent exactly one function, check. No validity window
  // is set, so the platform default applies: 90 days.
  step(6, "Granting the agent exactly one function: check (member delegation).");
  const grant: BoundGrant = {
    grantee: agentDid,
    contract_id: contractName,
    function: "check",
    scopes: [],
  };
  await t3n.updateMemberDelegation(grant);
  const doc = await t3n.getMemberDelegation();
  const mine = doc.grants.filter((g) => g.grantee === agentDid);
  console.log("    Grant read back from getMemberDelegation:", JSON.stringify(mine));

  // Step 7: the agent invokes check. A bare 403 here can mean the agent is
  // out of credit (per the official walkthrough), so top up 10 credits and
  // retry once, the same pattern as flow.ts.
  step(7, "Agent invoking check with the rules from contract/examples/rules.json.");
  const rules = JSON.parse(
    await readFile(new URL("./contract/examples/rules.json", import.meta.url), "utf8"),
  );
  async function agentInvoke(functionName: string, input: unknown) {
    return invoke({
      apiKey: agentApiKey,
      baseUrl: getNodeUrl(),
      request: {
        contract_id: contractName,
        contract_version: CONTRACT_VERSION,
        function_name: functionName,
        pii_did: myDid,
        input,
      },
    });
  }
  let checkResult: unknown;
  try {
    checkResult = await agentInvoke("check", rules);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 403) throw err;
    console.log("    First check attempt returned 403, the out of credit signal. Topping up 10 credits and retrying once:");
    const topup = await t3n.fundAgent(agentDid, toBaseUnits(10));
    console.log("    top-up ledger seq:", topup.seqNo);
    checkResult = await agentInvoke("check", rules);
  }
  console.log("    check result (booleans only, no values):", JSON.stringify(checkResult));

  // Step 8: negative proof. The agent invokes store, which it was NOT
  // granted. The node should refuse before the contract runs (HTTP 403).
  step(8, "Agent invoking store, which it was NOT granted. Expecting a rejection:");
  let rejection: string;
  try {
    const bad = await agentInvoke("store", customer);
    rejection = "call returned without throwing: " + JSON.stringify(bad);
    console.log("    Unexpected: the ungranted call was NOT rejected. Result:", rejection);
  } catch (err) {
    const status = (err as { status?: number }).status;
    rejection =
      (err instanceof Error ? `${err.name}: ${err.message}` : String(err)) +
      (status !== undefined ? ` (status ${status})` : "");
    console.log("    Rejected as expected:", rejection);
  }

  // Summary and the share back line. This line is the proof an external user
  // pastes into a GitHub issue so the run can be verified and counted.
  console.log("\n=== Summary ===");
  console.log("Your DID:", myDid);
  console.log("Organisation DID:", orgDid);
  console.log("Agent DID:", agentDid);
  console.log("Contract:", contractName, "| contract_id:", contractId ?? "registered in an earlier run");
  console.log("Stored: sample record, result:", JSON.stringify(storeResult));
  console.log("Grant: agent holds only function 'check' on", contractName);
  console.log("Check result:", JSON.stringify(checkResult));
  console.log("Ungranted store rejection:", rejection);
  console.log(
    "\nShare back line (paste this into a GitHub issue at https://github.com/dunoil/vaultcheck/issues to be counted as a verified external user):",
  );
  console.log(
    `VaultCheck onboarding complete | DID: ${myDid} | Contract: ${contractName} | contract_id: ${contractId ?? "earlier run"}`,
  );
  console.log(
    "Event form of the same proof: " +
      JSON.stringify({
        type: "onboarding_complete",
        did: myDid,
        contract: contractName,
        contract_id: contractId,
      }),
  );
} catch (err) {
  reportFailure(err);
  process.exit(1);
}
