# VaultCheck Demo Video, Narration Script

Locked script for the demo video in VIDEO-PLAN.md. English, one voice
(Helio, avocado_v2:MAI_03, built in tts CLI). Every fact below is from
STATUS.md live testnet records: contract z:f93478979727f0f1d3d3f7155232e44e908872af:vault,
contract_id 1151, store returned stored true, grant covers the check
function only with a 90 day window read back on testnet, six check rules
all true with booleans only, ungranted store call rejected with HTTP 403,
3 unique DIDs, 35 credits moved to the agent across 4 funding entries
(ledger seq 24792, 24802, 24808, 24814).

## S1, Hook (pose: presenting)

Every eligibility check starts with an uncomfortable trade. To prove you are old enough, solvent enough, or living in the right place, you hand over the very data you most want to protect: your identity document, your income, your home address. VaultCheck ends that trade.

## S2, Store (pose: envelope)

Here is how it works. The customer stores their private record once, inside a vault contract that runs in a trusted execution environment on the Terminal 3 network. The contract is registered on testnet, contract ID 1151, and in our live run the store call returned stored: true. The record goes in sealed, and the raw data never leaves the vault.

## S3, Grant (pose: key)

Next, the customer grants permission, not open access, and not to a person, but to an agent with its own decentralised identity. The grant covers exactly one function, check, and nothing else. It was read back from the network with a ninety day window, the platform default, after which it expires on its own. The agent cannot read the record. It cannot even open the vault.

## S4, Check (pose: yes)

Now the agent can ask questions. Is this customer verified? Are they over eighteen? Do they live in the right country, and do they earn above the agreed income floor? The vault runs six rules against the sealed record and answers with booleans only. Six rules checked, six answers true. No values. No documents. Nothing that can leak.

## S5, Rejection (pose: stop)

And here is the proof that the boundary holds. The same agent then tried to call store, a function it was never granted. The network refused it outright, HTTP 403, before the contract even ran. Access here is not a promise written in documentation. It is enforced by the network itself.

## S6, Traction and close (pose: wave)

This is VaultCheck, live on the Terminal 3 testnet. Three identities took part: the customer, the VaultCheck organisation, and its agent. Thirty five credits moved to the agent across four funding entries, and every step you have seen is recorded on our public traction dashboard. The code is open, the desk is public. Check us, without ever seeing a thing.
