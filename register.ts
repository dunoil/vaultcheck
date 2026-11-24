import { readFile } from "node:fs/promises";
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
} from "@terminal3/t3n-sdk";

// VaultCheck step 2 and 3 of the official walkthrough:
// build a TenantClient, register the vault WASM contract, create the vault map.
// Run with: T3N_API_KEY=<key> npx tsx register.ts
// The contract_id is printed once here. Save it in your notes, T3N returns it
// only from register and there is no lookup call for it.

const T3N_API_KEY = process.env.T3N_API_KEY;
if (!T3N_API_KEY) {
  console.error("T3N_API_KEY is not set.");
  process.exit(1);
}

const WASM_PATH =
  process.env.WASM_PATH ??
  new URL("./contract/target/wasm32-wasip2/release/agent_vault_starter.wasm", import.meta.url).pathname;
const CONTRACT_TAIL = "vault";
const CONTRACT_VERSION = "0.1.0";

setEnvironment("testnet");

const wasmComponent = await loadWasmComponent();
const address = eth_get_address(T3N_API_KEY);
const t3n = new T3nClient({
  trustAnchor: await resolveTrustAnchor("testnet"),
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
});
await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value;
console.log("Connected as:", tenantDid);

const tenant = new TenantClient({ t3n, baseUrl: getNodeUrl(), tenantDid });
await tenant.tenant.me();
console.log("TenantClient ready.");

const wasm = await readFile(WASM_PATH);
const result = await tenant.contracts.register({
  tail: CONTRACT_TAIL,
  version: CONTRACT_VERSION,
  wasm,
});
console.log("Registered:", result.name, "contract_id:", result.contract_id);

try {
  await tenant.maps.create({
    tail: "vault",
    visibility: "private",
    readers: { only: [result.contract_id] },
    writers: { only: [result.contract_id] },
  });
  console.log("Vault map created.");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes("already exists")) {
    await tenant.maps.update("vault", {
      readers: { only: [result.contract_id] },
      writers: { only: [result.contract_id] },
    });
    console.log("Vault map already existed, ACL updated to the new contract_id.");
  } else {
    throw err;
  }
}
