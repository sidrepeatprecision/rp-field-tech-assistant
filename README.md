# RP Field Tech Assistant

Mobile web agent for Repeat Precision field technicians. Ask questions about
PurpleSeal™/PurpleReign™ frac plugs, pumpdown rates, WLAK components, setting
tools, and any procedure documented in our training guides, technical
bulletins, or field service manuals — answered by Claude Sonnet 4.6 with our
training corpus baked in as cached context.

- **Platform:** Cloudflare Worker + Static Assets (one project serves UI and API)
- **Backend:** `src/index.ts` routes `/api/chat` → Anthropic; all other paths → static files
- **Auth:** Cloudflare Access with Entra ID / Microsoft 365 SSO — only @repeatprecision.com accounts
- **Knowledge base:** PDFs and DOCX from the training guides folder, bundled into the Worker at build time

```
rp-fieldtech-assistant/
├── src/                   # Worker code
│   ├── index.ts           # entry — routes /api/chat, falls through to assets
│   ├── chat.ts            # Anthropic API call + SSE passthrough
│   ├── system-prompt.ts   # bot's rules + tone (edit to change behavior)
│   └── knowledge.ts       # generated; replaced by build-knowledge.py
├── public/                # mobile-first PWA chat UI
├── scripts/build-knowledge.py
└── wrangler.toml          # Worker config
```

---

## 0. One-time prerequisites

- **Node.js 20+** — https://nodejs.org/
- **Python 3.10+** — https://www.python.org/downloads/
- A **Cloudflare account** — https://dash.cloudflare.com/sign-up
- An **Anthropic API key** — see step 1
- A **GitHub account** + the repo `rp-fieldtech-assistant` pushed to it
- **Git for Windows** — https://git-scm.com/download/win

**Important — Windows on ARM64:** `wrangler` doesn't run locally on Windows ARM
because the `workerd` runtime has no ARM binary. We work around this by
**deploying via Git → Cloudflare CI**, so wrangler only runs in Cloudflare's
Linux build environment.

**Important — don't keep this project inside OneDrive.** OneDrive sync locks
`node_modules/` files mid-install and breaks everything. Keep the repo at
`C:\Users\GrantMartin.AzureAD\Projects\rp-fieldtech-assistant\` (outside any
OneDrive folder).

Open PowerShell:

```powershell
cd "C:\Users\GrantMartin.AzureAD\Projects\rp-fieldtech-assistant"
pip install -r scripts/requirements.txt
```

(`npm install` is unnecessary locally — Cloudflare runs it during deploy.)

---

## 1. Create an Anthropic API key

1. https://console.anthropic.com/ → sign in.
2. Create an organization (e.g. "Repeat Precision") if needed.
3. Add a payment method + budget alert. Expected cost ~$20–60/month for
   ~30 questions/day with prompt caching.
4. **Settings → API keys → Create key.** Name it `rp-fieldtech-prod`.
5. Copy the key (`sk-ant-api03-…`) — shown once.

---

## 2. Build the knowledge base

Converts every PDF and DOCX in the training guides folder into `src/knowledge.ts`:

```powershell
python scripts/build-knowledge.py
```

Default source folder is the OneDrive training guides project. Override with
`--source "path/to/folder"`. Script reports per-document character counts.

Commit and push the regenerated `src/knowledge.ts`:

```powershell
git add src/knowledge.ts
git commit -m "Update knowledge base"
git push
```

The push triggers a new Cloudflare deploy automatically.

---

## 3. Create the Cloudflare Worker (first-time only)

1. dash.cloudflare.com → **Workers & Pages → Create**.
2. Choose **"Import a repository"** (or "Connect to Git" — whichever variant
   your dashboard shows). Authorize Cloudflare to read your GitHub.
3. Select `rp-fieldtech-assistant` from the repo list.
4. **Project / Worker name:** `rp-fieldtech`.
5. **Build configuration:**
   - Build command: *(leave empty)*
   - Deploy command: *(leave empty — Cloudflare auto-detects from wrangler.toml)*
6. **Variables and Secrets → Add variable:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-api03-…` key
   - Type: **Secret** (so it's encrypted)
7. **Create and Deploy.**

Cloudflare reads `wrangler.toml`, finds `src/index.ts` and `public/`, compiles
the Worker, and deploys. First build is ~1–2 minutes.

Your URL will be `https://rp-fieldtech.<your-handle>.workers.dev`.

---

## 4. Lock down with Cloudflare Access + Entra ID SSO

Without Access, the URL is public. To restrict to @repeatprecision.com:

### 4a. Enable Zero Trust

Cloudflare dashboard → **Zero Trust** (left nav). First time, pick a team
name (e.g. `repeat-precision`). Use the **Free** plan (50 users).

### 4b. Register the Entra ID application

In https://portal.azure.com/ → **Microsoft Entra ID → App registrations → New**.

- Name: `RP Field Tech Assistant`
- Account types: **single tenant**
- Redirect URI: Web + the callback Cloudflare gives you in step 4c (looks
  like `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`)
- Copy **Application (client) ID** and **Directory (tenant) ID**
- **Certificates & secrets → New client secret** → copy the secret value once
- **API permissions** → add Microsoft Graph delegated: `email`, `openid`,
  `profile`. **Grant admin consent.**

### 4c. Add Entra ID as a Cloudflare IdP

Zero Trust → **Settings → Authentication → Login methods → Add → Microsoft
(Azure AD)**. Paste the client ID, tenant ID, and secret. Copy Cloudflare's
redirect URL back into the Entra app registration. **Test** the connection.

### 4d. Protect the Worker

Zero Trust → **Access → Applications → Add → Self-hosted**.

- Name: `RP Field Tech Assistant`
- Application domain: `rp-fieldtech.<your-handle>.workers.dev`
- Identity providers: enable **Microsoft (Azure AD)** only (disable
  One-Time PIN fallback)
- Session duration: 24h
- Policy: **Allow → Include → Emails ending in** `@repeatprecision.com`

Visit your URL — should redirect to Microsoft login, then the chat UI.

---

## 5. Install on a phone

**iPhone (Safari):** Open URL → sign in → Share → **Add to Home Screen**.

**Android (Chrome):** Open URL → sign in → ⋮ menu → **Install app** / **Add to Home screen**.

---

## 6. Updating documents

When training docs change in the source OneDrive folder:

```powershell
python scripts/build-knowledge.py
git add src/knowledge.ts
git commit -m "Update knowledge base — <what changed>"
git push
```

Cloudflare auto-deploys in ~1 minute.

---

## 7. Adjusting bot behavior

| File | What's in it |
|------|--------------|
| `src/system-prompt.ts` | Rules, tone, citation format, refusal message |
| `src/chat.ts`          | Model choice (`MODEL`), max output tokens, API call |
| `src/index.ts`         | Routing (currently only `/api/chat`) |
| `public/index.html`    | Welcome text and header copy |
| `public/style.css`     | Colors (brand `#1E2D5B`), layout, dark mode |

Switch models in `src/chat.ts` — change `MODEL`:
- `claude-haiku-4-5-20251001` — 3–5× cheaper, slightly less rigorous
- `claude-sonnet-4-6` — current default
- `claude-opus-4-7` — overkill, ~5× more expensive than Sonnet

Push the change to redeploy.

---

## 8. Cost monitoring

- **Anthropic Console → Usage** — track API spend. Set a budget alert.
- **Cloudflare dashboard → Workers → rp-fieldtech → Metrics** — request count
  and CPU time. Free tier covers 100K requests/day.

Sonnet 4.6 with cached system prompt (~200K tokens):
- First request in a 5-min window: ~$0.60 (cache write)
- Subsequent in that window: ~$0.02–0.05
- 30 questions/day across the day: $20–60/month

To reduce cost: switch to Haiku 4.5 (section 7) or trim the corpus.

---

## 9. Troubleshooting

**Build fails: "Workers-specific command in a Pages project" or vice versa.**
The project was created as the wrong type. Delete it and re-create with the
matching type. This repo expects a **Worker** (uses `wrangler.toml` with
`main`, `[assets]`, and `run_worker_first`).

**`/api/chat` returns the HTML page.**
The Worker isn't running. Check that `wrangler.toml` has
`run_worker_first = true` under `[assets]` — otherwise static assets are
served first and the Worker never sees the request.

**"ANTHROPIC_API_KEY secret is not configured."**
Add the env var in Workers dashboard → Settings → Variables and Secrets →
mark it as a Secret.

**Empty / garbage text for a pumpdown chart PDF.**
`pymupdf4llm` can't read graph-heavy PDFs as tables. Create a `.md` text
version alongside the PDF and rebuild.

**Cloudflare Access prompts a tech for a One-Time PIN instead of Microsoft login.**
You forgot to disable the One-Time PIN fallback in the Access app's identity
providers (step 4d).

**`npm install` fails with `EBUSY` / `Unsupported platform: win32 arm64`.**
You're on Windows ARM64 and/or inside OneDrive. Don't run `npm install`
locally — let Cloudflare do it. See "Important" notes in section 0.

---

## 10. Old folder cleanup

The original Pages-style code in `functions/` is no longer used (replaced by
`src/`). Delete it once everything works:

```powershell
Remove-Item -Recurse -Force functions
git add -A
git commit -m "Remove unused Pages Functions code"
git push
```
