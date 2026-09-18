# CFS Recovery Coaching Curriculum

The team's coaching curriculum as a web app: a browsable dictionary, a chatbot that answers
from the curriculum, and a proposal-and-approval workflow that publishes agreed changes
back into the dictionary.

Anyone you allow can sign in with their work Google account. No Claude account needed.

---

## What you'll need

Four accounts, all with free tiers that comfortably cover a team of eight:

| Thing | What it's for | Cost |
|---|---|---|
| **Vercel** | hosts the app | Free (Hobby) |
| **Neon** (or any Postgres) | stores the curriculum, proposals, and history | Free tier |
| **Google Cloud** | sign-in with work accounts | Free |
| **Anthropic Console** | the Ask page | Pay per use, roughly cents per question |

Budget about 45 minutes for the first deploy.

---

## Step 1 — Put this code on GitHub

Create an empty repository, then from this folder:

```bash
git init
git add .
git commit -m "Coaching curriculum app"
git remote add origin https://github.com/YOUR-ORG/coaching-curriculum.git
git push -u origin main
```

## Step 2 — Create the Vercel project and database

1. In Vercel, **Add New → Project**, import the repository, and deploy. The first deploy
   will succeed but the app won't work yet — it has no settings.
2. In the project, open **Storage → Create Database → Neon (Postgres)** and connect it.
   Vercel sets `DATABASE_URL` for you. Use the **pooled** connection string if offered.
3. Copy your deployment URL (something like `https://coaching-curriculum.vercel.app`).
   If you have a custom domain, add it now and use that instead.

## Step 3 — Set up Google sign-in

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. **APIs & Services → OAuth consent screen** → choose **Internal** if your Google Workspace
   allows it (this alone limits sign-in to your organization). Fill in the app name and your
   support email.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   **Web application**.
4. Under **Authorized redirect URIs**, add exactly:
   `https://YOUR-DOMAIN/api/auth/callback`
5. Copy the **Client ID** and **Client secret**.

## Step 4 — Add the settings in Vercel

**Settings → Environment Variables.** Add each of these to all environments:

| Name | Value |
|---|---|
| `AUTH_SECRET` | A long random string. Generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | From step 3 |
| `GOOGLE_CLIENT_SECRET` | From step 3 |
| `APP_URL` | Your full URL, e.g. `https://coaching-curriculum.vercel.app` |
| `ALLOWED_DOMAINS` | `cfsrecovery.co` — anyone with an email at this domain can sign in |
| `BOARD_EMAILS` | Comma-separated emails of the Review Board. **Only these people can approve or decline.** |
| `SETUP_TOKEN` | Any random string. Used once, in step 5 |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5` |
| `ALLOWED_EMAILS` | Optional. Individual emails outside your domain, comma-separated |

Redeploy after saving (**Deployments → ⋯ → Redeploy**), so the new settings take effect.

## Step 5 — Load the curriculum

Visit this once in your browser:

```
https://YOUR-DOMAIN/api/setup?token=YOUR_SETUP_TOKEN
```

You should see `{"ok":true,"inserted":36,...}`. That creates the tables and loads all 36
entries from `data/curriculum.json`.

It is safe to run again: existing entries are left untouched, so approved edits are never
overwritten. (Add `&overwrite=1` only if you deliberately want to reset entry text back to
the shipped version.)

**Then delete `SETUP_TOKEN` from the environment variables.** It isn't needed again.

## Step 6 — Invite the team

Send them the URL. They sign in with their work Google account. Anyone at your allowed
domain can read everything, propose changes, and comment. Only the emails in `BOARD_EMAILS`
see the approve and decline buttons.

---

## Proposing a brand-new module

A proposal can either **change an existing entry** or **add a new one**. Pick the type at the
top of the form: choosing "New module or entry" greys out the entry selector and asks for a
section, a code (the next free one is suggested, e.g. M-19), a title, and a one-line summary.
On approval it becomes its own entry in the Curriculum tab, searchable, with its own history.

The wording box has **Preview** (shows exactly how it will render) and **Tidy up formatting**
(rewrites a pasted draft into the house format without changing wording). Review Board members
can also **restore** an earlier version from any entry's History.

After deploying this update, visit `/api/setup` once while signed in as a Review Board member
to add the new database columns. No token needed.

## How it works

**Curriculum** — every entry with its status, version, and review-item tags. Version history
is kept on each entry, so you can see what it said before a change was approved.

**Ask** — the question goes to the server, which picks the handful of entries most relevant
to it and sends only those to Claude with strict instructions: answer only from the
curriculum, cite entry codes, refuse to invent guidance, present both sides of any recorded
disagreement, redirect medical questions, and lead with the crisis response where relevant.
Your API key stays on the server and is never sent to the browser.

**Changes** — a proposal names an entry and the wording that should replace it. Coaches
comment. A Review Board member approves or declines with a reason. Approving publishes the
new wording, bumps the version number, and files the old wording in history — in a single
database transaction, so a half-applied change can't happen.

## Security notes

- Every page and API route requires a signed-in, allowed account. Session cookies are
  HMAC-signed with `AUTH_SECRET`, HTTP-only, and expire after 30 days.
- Changing `AUTH_SECRET` signs everybody out immediately — useful if a laptop goes missing.
- The Review Board check runs on the server, not just in the interface, so a coach can't
  publish to the curriculum by other means.
- The curriculum contains caregiver guidance and coaching material drawn from real client
  calls. Keep `ALLOWED_DOMAINS` tight and don't add a public sharing route.

## Running it locally

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run setup                  # loads the curriculum into your database
npm run dev
```

For local Google sign-in, add `http://localhost:3000/api/auth/callback` as a second
authorized redirect URI and set `APP_URL=http://localhost:3000`.

## Updating the curriculum text in bulk

`data/curriculum.json` is the shipped copy. Day-to-day changes should go through the
Changes page so they're recorded. For a bulk revision, edit the JSON, redeploy, and call
`/api/setup?token=...&overwrite=1` — but note this replaces entry text and skips the
approval trail.

## If something goes wrong

| Symptom | Cause |
|---|---|
| Redirect loop at sign-in | `APP_URL` doesn't exactly match the domain you're visiting, or the redirect URI in Google doesn't match `APP_URL` + `/api/auth/callback` |
| "That account isn't on the coaching team's list" | The email's domain isn't in `ALLOWED_DOMAINS` |
| Curriculum page says it hasn't been loaded | Step 5 hasn't run, or `DATABASE_URL` is missing |
| Ask says it isn't configured | `ANTHROPIC_API_KEY` is missing |
| Ask fails with a 502 | Usually an invalid API key, no credit on the Anthropic account, or a model name your key can't reach — try setting `ANTHROPIC_MODEL` to a model listed in your console |
| No approve buttons | Your email isn't in `BOARD_EMAILS` (it must match exactly, lowercase) |
