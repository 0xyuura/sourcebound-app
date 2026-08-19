import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTRACT,
  EXPLORER,
  connect,
  disconnect,
  getClaim,
  getConfig,
  hasWallet,
  listClaimIds,
  onAccountsChanged,
  recheck,
  verify,
  type Claim,
  type Config,
} from "./genlayer";
import "./App.css";

const SAMPLE_CLAIM = "This domain may be used in illustrative examples without asking for permission.";
const SAMPLE_URL = "https://example.com";

/** Highlight the stored quote inside the stored evidence. */
function Evidence({ text, quote }: { text: string; quote: string }) {
  const parts = useMemo(() => {
    if (!quote) return [{ text, hit: false }];
    const at = text.indexOf(quote);
    if (at < 0) return [{ text, hit: false }];
    return [
      { text: text.slice(0, at), hit: false },
      { text: text.slice(at, at + quote.length), hit: true },
      { text: text.slice(at + quote.length), hit: false },
    ].filter((p) => p.text.length > 0);
  }, [text, quote]);

  return (
    <p className="evidence">
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </p>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", claim: SAMPLE_CLAIM, url: SAMPLE_URL });
  const [stage, setStage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [action, setAction] = useState<"verify" | "recheck" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [c, list] = await Promise.all([getConfig(), listClaimIds()]);
      setConfig(c);
      setIds(list);
      setSelected((prev) => prev ?? list[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClaim = useCallback(async (id: string) => {
    try {
      setClaim(await getClaim(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    setClaim(null);
    void loadClaim(selected);
  }, [selected, loadClaim]);

  useEffect(
    () => onAccountsChanged((accounts) => setAccount(accounts.length ? accounts[0] : null)),
    []
  );

  const busy = stage === "signing" || stage === "pending";

  function progress(s: string, d?: string) {
    setStage(s);
    setDetail(d ?? null);
  }

  async function onConnect() {
    setError(null);
    try {
      setAccount(await connect());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDisconnect() {
    setError(null);
    setStage(null);
    setDetail(null);
    await disconnect();
    setAccount(null);
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    setAction("verify");
    progress("signing");
    try {
      const id = form.id.trim();
      await verify(account, id, form.claim.trim(), form.url.trim(), progress);
      setStage("done");
      await refresh();
      setSelected(id);
      setForm((f) => ({ ...f, id: "" }));
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAction(null);
    }
  }

  async function onRecheck() {
    if (!account || !selected) return;
    setError(null);
    setAction("recheck");
    progress("signing");
    try {
      await recheck(account, selected, progress);
      setStage("done");
      await loadClaim(selected);
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>SourceBound</h1>
          <p className="tag">
            Claims bound to the evidence every validator saw, and proof when that source moves
          </p>
        </div>
        <div className="chain">
          <a href={`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noreferrer">
            {CONTRACT}
          </a>
          {account ? (
            <span className="wallet">
              <span className="pill" title={account}>
                {account.slice(0, 6)}…{account.slice(-4)}
              </span>
              <button className="ghost" onClick={onDisconnect} disabled={busy}>
                Disconnect
              </button>
            </span>
          ) : (
            <button onClick={onConnect} disabled={!hasWallet()}>
              {hasWallet() ? "Connect wallet" : "No wallet detected"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <section className="panel">
          <h2>Verify a claim against a source</h2>
          <form onSubmit={onVerify}>
            <label>
              Claim id
              <input
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="gdp-q2-2026"
                maxLength={64}
                required
              />
            </label>
            <label>
              The claim
              <textarea
                value={form.claim}
                onChange={(e) => setForm({ ...form, claim: e.target.value })}
                rows={4}
                required
              />
            </label>
            <label>
              Source URL
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                pattern="https://.*"
                required
              />
            </label>
            <button type="submit" disabled={!account || busy}>
              {busy && action === "verify" ? "Waiting for consensus…" : "Send to the validators"}
            </button>
            {!account && <p className="muted">Connect a wallet to write. Reading needs none.</p>}
            {stage === "pending" && (
              <p className="muted">
                Sent. This transaction renders a page and calls a model, so it takes a while and
                occasionally has to be resent.
                {detail && (
                  <>
                    {" "}
                    <a href={`${EXPLORER}/tx/${detail}`} target="_blank" rel="noreferrer">
                      Follow it
                    </a>
                    .
                  </>
                )}
              </p>
            )}
            {stage === "done" && <p className="ok">Accepted and written to the contract.</p>}
          </form>
        </section>

        <section className="panel">
          <h2>How agreement is reached</h2>
          <ol className="phases">
            <li>
              <span className="num">A</span>
              <div>
                <strong>Agree on the evidence, with no model.</strong> Every validator renders the
                page and reduces it to canonical text in pure Python. Agreement is a word shingle
                Jaccard gate in integer arithmetic. Cheap, and tolerant of ads and counters without
                being tolerant of a page that now says something different.
              </div>
            </li>
            <li>
              <span className="num">B</span>
              <div>
                <strong>Agree on the judgment, on frozen evidence.</strong> Validators re-judge that
                same stored text instead of refetching, so the only variance left is model noise,
                absorbed by a confidence band.
              </div>
            </li>
          </ol>
          {config && (
            <dl className="meta">
              <div><dt>similarity gate</dt><dd>{config.similarity_gate}%</dd></div>
              <div><dt>confidence band</dt><dd>{config.confidence_band}</dd></div>
              <div><dt>confidence floor</dt><dd>{config.min_confidence}</dd></div>
              <div><dt>shingle size</dt><dd>{config.shingle_size}</dd></div>
            </dl>
          )}
          <p className="note">
            Below the floor the verdict is forced to INSUFFICIENT: the contract abstains rather
            than guessing.
          </p>
        </section>

        <section className="panel wide">
          <h2>Claims on chain</h2>
          {loading && <p className="muted">Reading the contract…</p>}
          {!loading && ids.length === 0 && <p className="muted">Nothing verified yet.</p>}
          <div className="ids">
            {ids.map((id) => (
              <button
                key={id}
                className={id === selected ? "chip on" : "chip"}
                onClick={() => setSelected(id)}
              >
                {id}
              </button>
            ))}
          </div>

          {claim && (
            <div className="claim">
              <div className="verdict-row">
                <span className={`verdict ${claim.verdict.toLowerCase()}`}>{claim.verdict}</span>
                <span className="counts">confidence {claim.confidence}</span>
                <span className="counts">revision {claim.revisions}</span>
                {claim.stale ? (
                  <span className="stale">source changed since verification</span>
                ) : (
                  <span className="fresh">source unchanged</span>
                )}
              </div>

              <blockquote className="the-claim">{claim.claim}</blockquote>

              <dl className="meta">
                <div>
                  <dt>source</dt>
                  <dd>
                    <a href={claim.source_url} target="_blank" rel="noreferrer">
                      {claim.source_url}
                    </a>
                  </dd>
                </div>
                <div><dt>evidence sha256</dt><dd className="hash">{claim.evidence_hash.slice(0, 24)}…</dd></div>
                <div><dt>verified</dt><dd>{claim.created_at}</dd></div>
                <div><dt>last checked</dt><dd>{claim.checked_at}</dd></div>
              </dl>

              <h3>The evidence, with the passage the validators grounded on</h3>
              <Evidence text={claim.evidence_excerpt} quote={claim.quote} />
              <p className="note">
                The highlighted passage is stored on chain and had to appear literally in this
                evidence. A fabricated citation cannot be written: it rejects the leader instead.
              </p>

              <div className="actions">
                <button onClick={onRecheck} disabled={!account || busy}>
                  {busy && action === "recheck" ? "Rechecking…" : "Recheck the source"}
                </button>
                <p className="muted">
                  Refetches the page, recomputes the hash, and compares it with the one stored at
                  verification time. If the page was edited, the claim is flagged stale on chain
                  and rejudged. Nothing is overwritten silently: the revision count moves.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer>
        <a href="https://github.com/0xyuura/genlayer-sourcebound" target="_blank" rel="noreferrer">
          Contract source
        </a>
        <span>·</span>
        <a href={`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noreferrer">
          Explorer
        </a>
        <span>·</span>
        <span className="muted">Every value on this page is read from the contract.</span>
      </footer>
    </div>
  );
}
