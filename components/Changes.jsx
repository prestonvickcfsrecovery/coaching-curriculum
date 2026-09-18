"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { plain, when, md } from "@/lib/md";
import { load, save, clear } from "@/lib/persist";

const NEW_TYPE = "New module or entry";
const TYPES = [NEW_TYPE, "Change to existing guidance", "Clarification", "Removal", "Editorial"];
const SECTIONS = [
  { key: "module", label: "Topic modules", prefix: "M-" },
  { key: "core", label: "Core concepts", prefix: "" },
  { key: "zone", label: "Zone guides", prefix: "" },
  { key: "reference", label: "Reference", prefix: "" },
];
const TEMPLATE = `### Core principle
The idea this module rests on, in one to three sentences.

### What we do
- **Name the thing** — the guidance, and who taught it.
- **Next point** — keep each one actionable.

### What we say
- "Approved phrasing a coach can use." (Coach)

### What we avoid
- What we steer clients away from, and why.

### Open disagreements
- Where coaches currently differ, if anywhere.`;

export default function Changes({ user }) {
  const router = useRouter();
  const params = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [proposals, setProposals] = useState(null);
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState({
    kind: "edit", entryId: "", title: "", type: "Change to existing guidance", proposedText: "",
    rationale: "", urgency: "Routine", newCode: "", newTitle: "", newSummary: "", newSection: "module",
  });
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const isNew = form.kind === "new";

  // Type drives the form: picking the "new" option switches it over and drops
  // the house template into the wording box.
  function pickType(type) {
    setForm((f) => ({
      ...f,
      type,
      kind: type === NEW_TYPE ? "new" : "edit",
      proposedText: type === NEW_TYPE && !f.proposedText.trim() ? TEMPLATE : f.proposedText,
    }));
  }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [drafts, setDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [working, setWorking] = useState({});

  async function loadAll() {
    const [e, p] = await Promise.all([
      fetch("/api/entries").then((r) => r.json()),
      fetch("/api/proposals").then((r) => r.json()),
    ]);
    setEntries(e.entries || []);
    setProposals(p.proposals || []);
    setComments(p.comments || []);
    return e.entries || [];
  }

  useEffect(() => {
    const saved = load("proposal", null);
    loadAll().then((list) => {
      const want = params.get("entry");
      setForm((f) => {
        const base = saved ? { ...f, ...saved } : f;
        const entryId = (want && list.some((x) => x.id === want))
          ? want
          : (base.entryId && list.some((x) => x.id === base.entryId) ? base.entryId : (list[0]?.id || ""));
        return { ...base, entryId };
      });
      setReady(true);
    });
  }, [params]);

  // Hold the draft proposal so a trip to the Curriculum or Ask tab doesn't lose it.
  useEffect(() => { if (ready) save("proposal", form); }, [form, ready]);

  const suggestCode = useMemo(() => {
    const sec = SECTIONS.find((x) => x.key === form.newSection);
    if (!sec || !sec.prefix) return "";
    const used = entries
      .filter((e) => e.section === form.newSection)
      .map((e) => {
        const m = String(e.code || "").match(/(\d+)$/);
        return m ? Number(m[1]) : 0;
      });
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return sec.prefix + String(next).padStart(2, "0");
  }, [entries, form.newSection]);

  useEffect(() => {
    if (isNew && !form.newCode) setForm((f) => ({ ...f, newCode: suggestCode }));
  }, [suggestCode, isNew]);

  const open = useMemo(() => (proposals || []).filter((p) => p.status === "open"), [proposals]);
  const decided = useMemo(() => (proposals || []).filter((p) => p.status !== "open"), [proposals]);

  async function formatDraft() {
    if (!form.proposedText.trim()) return;
    setFormatting(true); setMsg("");
    try {
      const r = await fetch("/api/format", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: form.proposedText, title: form.newTitle || form.title }),
      }).then((x) => x.json());
      if (r.error) setMsg(r.error);
      else { setForm((f) => ({ ...f, proposedText: r.text })); setPreview(true); }
    } catch { setMsg("Couldn't reach the formatter."); }
    setFormatting(false);
  }

  async function submit() {
    if (!form.title.trim()) { setMsg("Give the proposal a title."); return; }
    if (!isNew && !form.entryId) { setMsg("Pick the entry this changes."); return; }
    if (isNew && (!form.newCode.trim() || !form.newTitle.trim() || !form.proposedText.trim())) {
      setMsg("A new entry needs a code, a title, and its wording."); return;
    }
    setSaving(true); setMsg("");
    const r = await fetch("/api/proposals", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
    }).then((x) => x.json()).catch(() => ({ error: "Couldn't submit." }));
    setSaving(false);
    if (r.error) { setMsg(r.error); return; }
    setForm((f) => ({ ...f, title: "", proposedText: "", rationale: "", newTitle: "", newSummary: "", newCode: "" }));
    setPreview(false);
    clear("proposal");
    setMsg("Submitted. The Review Board will see it.");
    loadAll();
  }

  async function comment(id) {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [id]: "" }));
    await fetch(`/api/proposals/${id}/comments`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
    });
    loadAll();
  }

  async function decide(id, approve) {
    setWorking((w) => ({ ...w, [id]: approve ? "Publishing…" : "Declining…" }));
    const r = await fetch(`/api/proposals/${id}/decide`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve, note: notes[id] || "" }),
    }).then((x) => x.json()).catch(() => ({ error: "Couldn't record that." }));
    setWorking((w) => ({ ...w, [id]: r.error || "" }));
    if (!r.error) loadAll();
  }

  function Card({ p }) {
    const entry = entries.find((e) => e.id === p.entry_id);
    const cs = comments.filter((c) => c.proposal_id === p.id);
    return (
      <div className={`card ${p.status}`}>
        <div className="meta" style={{ marginBottom: 6 }}>
          <span className={`chip ${p.status}`}>{p.status}</span>
          <span>{p.kind === "new" ? `New · ${p.new_code || ""}` : p.entry_code}</span><span>·</span>
          <span>{p.author_name || p.author_email}</span><span>·</span>
          <span>{when(p.created_at)}</span>
          {String(p.urgency || "").startsWith("Safety") && <span className="rr hi">fast track</span>}
        </div>
        <h3>{p.title}</h3>
        <div className="meta">{p.type} · {p.kind === "new" ? (p.new_title || "New entry") : p.entry_title}</div>
        {p.rationale && <p style={{ margin: "10px 0 0", fontSize: "14.5px" }}>{p.rationale}</p>}

        {p.proposed_text && (p.kind === "new" ? (
          <div className="diff one">
            <div className="now">
              <h4>PROPOSED ENTRY</h4>
              {plain(p.proposed_text).slice(0, 900)}{p.proposed_text.length > 900 ? "…" : ""}
            </div>
          </div>
        ) : entry ? (
          <div className="diff">
            <div className="was">
              <h4>CURRENT — v{entry.version}</h4>
              {plain(entry.body).slice(0, 700)}{entry.body.length > 700 ? "…" : ""}
            </div>
            <div className="now">
              <h4>PROPOSED</h4>
              {plain(p.proposed_text).slice(0, 700)}{p.proposed_text.length > 700 ? "…" : ""}
            </div>
          </div>
        ) : null)}

        {p.status !== "open" && (
          <div className="note" style={{ marginTop: 10 }}>
            <b>{p.status === "approved" ? "Approved" : "Declined"}</b> by {p.decided_by} on {when(p.decided_at)}
            {p.decision_note ? ` — ${p.decision_note}` : ""}
            {p.status === "approved" && p.kind === "new" && p.created_entry_id
              ? <> · published as <a href={`/#${p.created_entry_id}`}>{p.new_code} {p.new_title}</a> in the Curriculum tab</>
              : p.status === "approved" && p.applied_version ? ` · published as v${p.applied_version}` : ""}
          </div>
        )}

        {cs.map((c) => (
          <div className="cmt" key={c.id}>
            <div className="who2">{c.author_name || c.author_email} · {when(c.created_at)}</div>
            {c.text}
          </div>
        ))}

        {p.status === "open" && (
          <>
            <div className="cmt" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <input
                placeholder="Add to the discussion"
                value={drafts[p.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); comment(p.id); } }}
                style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 7, background: "var(--paper)" }}
              />
              <button className="btn sm ghost" onClick={() => comment(p.id)}>Comment</button>
            </div>

            {user?.isBoard ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder="Reason for the decision"
                  value={notes[p.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 180, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 7, background: "var(--paper)" }}
                />
                <button className="btn sm ok" disabled={!!working[p.id]} onClick={() => decide(p.id, true)}>
                  {working[p.id] === "Publishing…" ? "Publishing…" : "Approve and publish"}
                </button>
                <button className="btn sm no" disabled={!!working[p.id]} onClick={() => decide(p.id, false)}>Decline</button>
                {working[p.id] && working[p.id] !== "Publishing…" && working[p.id] !== "Declining…" && (
                  <span className="note">{working[p.id]}</span>
                )}
              </div>
            ) : (
              <p className="note" style={{ marginTop: 10 }}>The Review Board decides this one.</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-solo">
      <div className="two">
        <div>
          <h2 className="sec-h">Changes</h2>
          <p className="sec-p">
            Proposals waiting on the Review Board, and every decision already made. Approving a proposal
            publishes its wording straight into the curriculum and keeps the old wording in the entry&apos;s history.
          </p>
          {proposals === null ? (
            <div className="empty"><span className="spin" /> Loading…</div>
          ) : !proposals.length ? (
            <div className="empty"><b>No proposals yet.</b><br />The first one starts on the right, or from any curriculum entry.</div>
          ) : (
            <>
              {open.length ? <><div className="grp">Waiting on a decision</div>{open.map((p) => <Card key={p.id} p={p} />)}</>
                : <div className="empty">Nothing is waiting on the Board.</div>}
              {decided.length ? <><div className="grp" style={{ marginTop: 26 }}>Decided</div>{decided.map((p) => <Card key={p.id} p={p} />)}</> : null}
            </>
          )}
        </div>

        <div>
          <div className="card">
            <h3>Propose a change</h3>
            <p className="note" style={{ margin: "4px 0 14px" }}>
              Any coach can propose. The Review Board decides, and the reason is recorded either way.
            </p>
            <div className="field">
              <label htmlFor="ptype">Type</label>
              <select id="ptype" value={form.type} onChange={(e) => pickType(e.target.value)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className={`field${isNew ? " muted" : ""}`}>
              <label htmlFor="entry">
                Entry this changes{" "}
                {isNew && <span className="hint">Not needed for a new entry</span>}
              </label>
              <select id="entry" value={isNew ? "" : form.entryId} disabled={isNew}
                onChange={(e) => setForm({ ...form, entryId: e.target.value })}>
                {isNew
                  ? <option value="">— this creates a new entry —</option>
                  : entries.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.title}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="ptitle">What are you changing? <span className="hint">One line</span></label>
              <input id="ptitle" value={form.title}
                placeholder={isNew ? "e.g. Add a module on returning to exercise" : "e.g. Define when the First Signal Stop applies"}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            {isNew && (
              <>
                <div className="field">
                  <label htmlFor="sec">Where it belongs</label>
                  <select id="sec" value={form.newSection}
                    onChange={(e) => setForm({ ...form, newSection: e.target.value, newCode: "" })}>
                    {SECTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="ncode">Code</label>
                    <input id="ncode" value={form.newCode} placeholder={suggestCode || "e.g. 2.8"}
                      onChange={(e) => setForm({ ...form, newCode: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="field">
                    <label htmlFor="ntitle">Title</label>
                    <input id="ntitle" value={form.newTitle} placeholder="e.g. Returning to Exercise"
                      onChange={(e) => setForm({ ...form, newTitle: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="nsum">One-line summary <span className="hint">Shown under the title and in search</span></label>
                  <input id="nsum" value={form.newSummary}
                    placeholder="e.g. How we reintroduce exercise without tagging movement as dangerous."
                    onChange={(e) => setForm({ ...form, newSummary: e.target.value })} />
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="ptext">
                {isNew ? "The entry wording" : "Proposed wording"}{" "}
                <span className="hint">
                  {isNew
                    ? "This becomes the entry, exactly as written."
                    : "Replaces the entry if approved. Leave blank to discuss first."}
                </span>
              </label>
              <textarea id="ptext" value={form.proposedText}
                placeholder="Write it as you think it should read…"
                onChange={(e) => setForm({ ...form, proposedText: e.target.value })} />
              <div className="tools">
                <button type="button" className="btn sm ghost" disabled={!form.proposedText.trim()}
                  onClick={() => setPreview((v) => !v)}>
                  {preview ? "Hide preview" : "Preview"}
                </button>
                <button type="button" className="btn sm ghost" disabled={formatting || !form.proposedText.trim()}
                  onClick={formatDraft}>
                  {formatting ? "Tidying…" : "Tidy up formatting"}
                </button>
                <span className="note">Headings <code>###</code>, bullets <code>-</code>, tables <code>| a | b |</code></span>
              </div>
              {preview && (
                <div className="pv">
                  <div className="pv-h">How it will look in the Curriculum tab</div>
                  <div className="prose" dangerouslySetInnerHTML={{ __html: md(form.proposedText) }} />
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="pwhy">Why this change <span className="hint">Call examples, client outcomes, patterns</span></label>
              <textarea id="pwhy" style={{ minHeight: 64 }} value={form.rationale}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="purg">Urgency</label>
              <select id="purg" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                <option>Routine</option>
                <option>Safety — fast track</option>
              </select>
            </div>
            <div className="submit-row">
              <button className="btn" onClick={submit} disabled={saving}>
                {saving ? "Submitting…" : "Submit proposal"}
              </button>
              {(form.title || form.proposedText || form.rationale) && (
                <button className="linkish" onClick={() => {
                  if (!confirm("Clear this draft?")) return;
                  setForm((f) => ({ ...f, title: "", proposedText: "", rationale: "", newTitle: "", newSummary: "", newCode: "" }));
                  setPreview(false); clear("proposal");
                }}>Clear draft</button>
              )}
            </div>
            {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
