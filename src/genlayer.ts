import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

/**
 * Every call here goes to the real contract on Testnet Bradbury. There is no
 * mock path and no fixture: if the network is down the app shows an error
 * rather than inventing a verdict.
 */
export const CONTRACT = "0x0B5126B7c7D17992c2b75f1BEDb9E14eEc5d1792" as const;

export const EXPLORER = "https://explorer-bradbury.genlayer.com";
export const CHAIN_ID_HEX = "0x107d"; // 4221

export type Claim = {
  claim: string;
  source_url: string;
  evidence_hash: string;
  evidence_excerpt: string;
  verdict: "SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT";
  confidence: number;
  quote: string;
  submitter: string;
  created_at: string;
  checked_at: string;
  revisions: number;
  stale: boolean;
};

export type Config = {
  min_confidence: number;
  similarity_gate: number;
  confidence_band: number;
  shingle_size: number;
  evidence_chars: number;
  owner: string;
};

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

function injected(): Eip1193 | undefined {
  return (globalThis as { ethereum?: Eip1193 }).ethereum;
}

export function hasWallet(): boolean {
  return Boolean(injected());
}

/** Reads work without a wallet. Only `verify` and `recheck` need one. */
function client(account?: string) {
  return createClient({
    chain: testnetBradbury,
    ...(account ? { account: account as `0x${string}`, provider: injected() as never } : {}),
  });
}

export async function connect(): Promise<string> {
  const eth = injected();
  if (!eth) throw new Error("No EIP-1193 wallet found. Install MetaMask to write.");

  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: "Genlayer Bradbury Testnet",
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
          rpcUrls: ["https://rpc-bradbury.genlayer.com"],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
  }

  return accounts[0];
}

/**
 * EIP-1193 has no real disconnect. Ask the wallet to revoke the `eth_accounts`
 * permission where that is supported, and forget the account either way.
 */
export async function disconnect(): Promise<void> {
  const eth = injected();
  if (!eth) return;
  try {
    await eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // Wallet does not support it. Clearing local state is still correct.
  }
}

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  const eth = injected();
  if (!eth?.on || !eth.removeListener) return () => {};
  const wrapped = ((accounts: string[]) => handler(accounts)) as (...args: never[]) => void;
  eth.on("accountsChanged", wrapped);
  return () => eth.removeListener?.("accountsChanged", wrapped);
}

async function read(functionName: string, args: unknown[] = []): Promise<string> {
  const out = await client().readContract({
    address: CONTRACT,
    functionName,
    args: args as never,
  });
  return String(out);
}

export async function getConfig(): Promise<Config> {
  return JSON.parse(await read("config"));
}

export async function listClaimIds(): Promise<string[]> {
  const total = Number(await read("count"));
  const ids: string[] = [];
  for (let i = 0; i < total; i++) ids.push(await read("id_at", [i]));
  return ids.reverse(); // newest first
}

export async function getClaim(id: string): Promise<Claim> {
  return JSON.parse(await read("get_claim", [id]));
}

export type WriteProgress = (stage: string, detail?: string) => void;

async function send(
  account: string,
  functionName: string,
  args: unknown[],
  onProgress: WriteProgress
): Promise<string> {
  onProgress("signing");

  const hash = await client(account).writeContract({
    address: CONTRACT,
    functionName,
    args: args as never,
    value: 0n,
  });

  onProgress("pending", String(hash));

  const receipt = await client(account).waitForTransactionReceipt({
    hash: hash as never,
    status: "ACCEPTED" as never,
    interval: 5000,
    retries: 160,
  });

  const status = String(
    (receipt as { statusName?: string; status?: string }).statusName ??
      (receipt as { status?: string }).status ??
      ""
  );

  if (status && !/ACCEPTED|FINALIZED/i.test(status)) {
    throw new Error(
      `Consensus ended ${status}. A render plus a model call in one transaction sometimes times out on Bradbury. Nothing was written, so this can be resent unchanged.`
    );
  }

  return String(hash);
}

/** Register a claim, bind it to a source, and have the validators judge it. */
export function verify(
  account: string,
  claimId: string,
  claim: string,
  sourceUrl: string,
  onProgress: WriteProgress
): Promise<string> {
  return send(account, "verify", [claimId, claim, sourceUrl], onProgress);
}

/**
 * Refetch the source and compare hashes. This is the interesting one: if the
 * cited page changed after the claim was verified, the contract can prove it.
 */
export function recheck(
  account: string,
  claimId: string,
  onProgress: WriteProgress
): Promise<string> {
  return send(account, "recheck", [claimId], onProgress);
}
