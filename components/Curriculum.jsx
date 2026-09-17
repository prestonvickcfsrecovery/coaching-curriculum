"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { md, esc, when } from "@/lib/md";

const SECTIONS = [
  { key: "core", label: "Core concepts" },
  { key: "zone", label: "Zone guides" },
  { key: "module", label: "Topic modules" },
  { key: "reference", label: "Reference" },
];
const ZCLASS = { red: "zr", orange: "zo", yellow: "zy", green: "zg" };
const HIGH = ["R-13", "R-14", "R-15", "R-02", "R-06"];

export default function Curriculum() {
  const router = useRouter();
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [find, setFind] = useState("");
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch("/api/entries")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        setEntries(d.entries || []);
        if (d.entries?.length) {
          const hash = decodeURIComponent((location.hash || "").replace("#", ""));
          setSel(d.entries.find((e) => e.id === hash)?.id || d.entries[0].id);
        }
      })
      .catch(() => setErr("Couldn't load the curriculum."));
  }, []);

  const entry = useMemo(
    () => (entries || []).find((e) => e.id === sel) || null,
    [entries, sel]
  );

  useEffect(() => {
    setShowHistory(false);
    setHistory(null);
  }, [sel]);

  const filtered = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return entries || [];
    return (entries || []).filter((e) =>
      `${e.title} ${e.code} ${e.summary} ${e.body}`.toLowerCase().includes(q)
    );
  }, [entries, find]);

  async function loadHistory() {
    setShowHistory(true);
    if (history) return;
    const r = await fetch(`/api/entries/${encodeURIComponent(entry.id)}/history`).then((x) => x.json());
    setHistory(r.history || []);
  }

  if (entries === null) {
    return <div className="page-solo"><div className="empty"><span className="spin" /> Loading the curriculum…</div></div>;
  }
  if (!entries.length) {
    return (
      <div className="page-solo">
        <div className="empty">
          <b>The curriculum hasn&apos;t been loaded yet.</b>
          <br />
          Visit <code>/api/setup?token=YOUR_SETUP_TOKEN</code> once to create the tables and load it.
          {err ? <><br /><br /><span className="note">{err}</span></> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="cols">
      <aside>
        <input
          className="finder"
          placeholder="Find an entry"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        {SECTIONS.map((sec) => {
          const list = filtered.filter((e) => e.section === sec.key);
          if (!list.length) return null;
          return (
            <div key={sec.key}>
              <div className="grp">{sec.label}</div>
              {list.map((e) => (
                <button
                  key={e.id}
                  className={`idx ${e.id === sel ? "on " : ""}${ZCLASS[e.zone] || ""}`}
                  onClick={() => { setSel(e.id); history && setHistory(null); location.hash = e.id; }}
                >
                  <code>{e.code}</code>
                  <span>{e.title}</span>
                </button>
              ))}
            </div>
          );
        })}
        {!filtered.length && <div className="note" style={{ padding: "8px 2px" }}>No entry matches that.</div>}
      </aside>

      <main>
        {entry && (
          <div className="entry">
            <div className="eyebrow">
              <span className={`chip ${entry.status}`}>{entry.status}</span>
              <span>{entry.code}</span><span>·</span>
              <span>v{entry.version}</span>
              {entry.updated_at && <><span>·</span><span>updated {when(entry.updated_at)}</span></>}
              {(entry.review_refs || []).map((r) => (
                <span key={r} className={`rr${HIGH.includes(r) ? " hi" : ""}`}>{r}</span>
              ))}
            </div>
            <h1 className="title">{entry.title}</h1>
            {entry.summary && <p className="lede">{entry.summary}</p>}
            <div className="prose" dangerouslySetInnerHTML={{ __html: md(entry.body) }} />

            <div className="entry-foot">
              <button className="btn" onClick={() => router.push(`/changes?entry=${encodeURIComponent(entry.id)}`)}>
                Propose a change
              </button>
              <button className="btn ghost" onClick={() => router.push(`/ask?q=${encodeURIComponent("About " + entry.title + ": ")}`)}>
                Ask about this
              </button>
              {entry.version > 1 || showHistory ? (
                <button className="linkish" onClick={loadHistory}>
                  {showHistory ? "History" : `History (v${entry.version})`}
                </button>
              ) : null}
              {entry.source_note && <span>Source: {entry.source_note}</span>}
            </div>

            {showHistory && (
              <div className="hist">
                {history === null ? (
                  <span className="note"><span className="spin" /> Loading history…</span>
                ) : history.length === 0 ? (
                  <span className="note">No earlier versions recorded.</span>
                ) : (
                  history.map((h) => (
                    <div className="hist-row" key={h.version + "-" + h.changed_at}>
                      <b>v{h.version}</b>
                      <span>{h.note || "—"}</span>
                      <span className="when">{h.changed_by} · {when(h.changed_at)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
