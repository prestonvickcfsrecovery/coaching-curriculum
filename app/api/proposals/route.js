import { NextResponse } from "next/server";
import { q, migrate } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireUser(); } catch (res) { return res; }
  try {
    const proposals = await q(
      `SELECT p.*, e.code AS entry_code, e.title AS entry_title, e.version AS entry_version
       FROM proposals p LEFT JOIN entries e ON e.id = p.entry_id
       ORDER BY p.created_at DESC`
    );
    const comments = await q(
      `SELECT id, proposal_id, author_name, author_email, text, created_at
       FROM comments ORDER BY created_at ASC`
    );
    return NextResponse.json({ proposals, comments });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e), proposals: [], comments: [] }, { status: 500 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireUser(); } catch (res) { return res; }
  const b = await req.json().catch(() => ({}));
  const title = (b.title || "").trim();
  const isNew = b.kind === "new";

  if (!title) {
    return NextResponse.json({ error: "Give the proposal a title." }, { status: 400 });
  }
  if (isNew) {
    if (!(b.newCode || "").trim() || !(b.newTitle || "").trim() || !(b.newSection || "").trim()) {
      return NextResponse.json(
        { error: "A new entry needs a code, a title, and a section." }, { status: 400 }
      );
    }
    if (!(b.proposedText || "").trim()) {
      return NextResponse.json(
        { error: "A new entry needs its wording. That wording becomes the entry." }, { status: 400 }
      );
    }
    const code = b.newCode.trim().toUpperCase();
    const clash = await q(`SELECT id FROM entries WHERE upper(code) = $1`, [code]);
    if (clash.length) {
      return NextResponse.json({ error: `${code} is already in use. Pick another code.` }, { status: 409 });
    }
  } else if (!(b.entryId || "").trim()) {
    return NextResponse.json({ error: "Choose the entry this changes." }, { status: 400 });
  }

  // The columns for "new entry" proposals arrive with a later release. If this
  // deployment's database predates them, apply the migration and try once more,
  // rather than handing the coach an error they can do nothing about.
  const insert = () => q(
    `INSERT INTO proposals (entry_id, title, type, proposed_text, rationale, urgency,
                            author_email, author_name, kind, new_code, new_title, new_summary, new_section)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [isNew ? null : b.entryId.trim(), title.slice(0, 300),
     (b.type || (isNew ? "New module" : "Change to existing guidance")).slice(0, 80),
     (b.proposedText || "").slice(0, 60000), (b.rationale || "").slice(0, 8000),
     (b.urgency || "Routine").slice(0, 40), user.email, user.name,
     isNew ? "new" : "edit",
     isNew ? b.newCode.trim().toUpperCase().slice(0, 20) : "",
     isNew ? b.newTitle.trim().slice(0, 200) : "",
     isNew ? (b.newSummary || "").trim().slice(0, 400) : "",
     isNew ? b.newSection.trim().slice(0, 40) : ""]
  );

  let rows;
  try {
    rows = await insert();
  } catch (e) {
    const msg = String(e.message || e);
    if (/column .* does not exist|does not exist|null value in column "entry_id"/i.test(msg)) {
      try {
        await migrate();
        rows = await insert();
      } catch (e2) {
        return NextResponse.json(
          { error: "The database is missing the newer proposal fields. Visit /api/setup while signed in as a Review Board member, then try again.", detail: String(e2.message || e2).slice(0, 200) },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ error: "Couldn't save the proposal.", detail: msg.slice(0, 200) }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: rows[0].id });
}
