# SourceBound App

A frontend for [SourceBound](https://github.com/0xyuura/genlayer-sourcebound), an
Intelligent Contract that binds a judgment to the exact evidence every validator
saw, and can prove afterwards that the cited source changed.

**Contract:** [`0x0B5126B7c7D17992c2b75f1BEDb9E14eEc5d1792`](https://explorer-bradbury.genlayer.com/address/0x0B5126B7c7D17992c2b75f1BEDb9E14eEc5d1792)
on Testnet Bradbury.

Reading needs no wallet. `verify` and `recheck` send real consensus
transactions.

## What it is for

"Ask an LLM whether a claim is true" is not a consensus primitive. Two
validators looking at the same live page can disagree for two unrelated reasons:
they fetched different bytes, or they read the same bytes and judged them
differently. Those need different equivalence rules, and SourceBound splits them.

The app is built to show that split rather than hide it:

- **Phase A and phase B are named on screen**, with the actual consensus
  parameters read from `config()`: the similarity gate, the confidence band, the
  confidence floor, the shingle width.
- **The grounded passage is highlighted inside the stored evidence.** A quote
  that is not a literal substring of that evidence cannot be written to storage,
  so what is highlighted is what the validators verified deterministically.
- **`Recheck the source` is the interesting button.** It refetches the page,
  recomputes the hash, and compares it with the one stored at verification time.
  If the page was edited, the claim is flagged stale on chain and rejudged.
  Nothing is overwritten silently: the revision count moves and `checked_at` moves.

That last property is the one an off chain LLM call cannot give you. The contract
can prove the source moved, because the hash of what validators agreed on is on
chain.

## Contract calls this app makes

| Where | Call | Kind |
| --- | --- | --- |
| Consensus panel | `config()` | view |
| Claim list | `count()`, `id_at(i)` | view |
| Claim detail | `get_claim(id)` | view |
| Verify form | `verify(claim_id, claim, source_url)` | write, consensus |
| Recheck button | `recheck(claim_id)` | write, consensus |

All of them are in [`src/genlayer.ts`](src/genlayer.ts). There is no mock path
and no fixture.

## Wallet

Writes need a funded account on Bradbury. The connect button requests accounts
and asks the wallet to switch to chain `0x107d` (4221), falling back to
`wallet_addEthereumChain` when the wallet does not know it yet. Testnet GEN comes
from <https://testnet-faucet.genlayer.foundation/>.

Disconnect asks the wallet to revoke the `eth_accounts` permission where that is
supported, and clears the app's own state either way, because EIP-1193 has no
real disconnect.

A `verify` renders a web page **and** calls a model inside one consensus
transaction, so it takes a while and occasionally ends `NOT_VOTED` with nothing
written. The app says exactly that and invites a resend rather than reporting a
generic failure.

## Run it

```bash
npm install
npm run dev
npm run build
```

Vite, React, TypeScript, `genlayer-js` 1.1.8. No backend, no API keys, no
analytics. The only network calls are to the GenLayer RPC.

## Licence

MIT.
