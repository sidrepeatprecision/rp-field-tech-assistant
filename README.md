# RP Field Tech Assistant

Mobile web agent for Repeat Precision field technicians. Ask questions about
PurpleSeal™/PurpleReign™ frac plugs, pumpdown rates, WLAK components, setting
tools, and any procedure documented in our training guides, technical
bulletins, or field service manuals — answered by Claude Sonnet 4.6 with our
training corpus baked in as cached context.

- **Frontend:** static mobile-first chat UI (Cloudflare Pages)
- **Backend:** one serverless function that calls the Anthropic API (Cloudflare Pages Functions)
- **Auth:** Cloudflare Access with Entra ID / Microsoft 365 SSO — only @repeatprecision.com accounts
- **Knowledge base:** PDFs and DOCX from the training guides folder, bundled into the worker at build time

---

## 0. One-time prerequisites

Install on your dev machine:

- **Node.js 20+** — https://nodejs.org/ (LTS installer)
- **Python 3.10+** — https://www.python.org/downloads/
- A **Cloudflare account** — https://dash.cloudflare.com/sign-up (free tier is fine)
- An **Anthropic API key** — see step 1 below

Open a terminal in this project folder. Do **not** run from `C:\Windows\System32`
— Cygwin fork limitations break shell tools there. Use **Win+R → cmd**, then:

```cmd
cd /d "C:\Users\GrantMartin.AzureAD\OneDrive - RJ Machine\Documents\Claude\Projects\rp-fieldtech-assistant"
```

Install deps:

```cmd
npm install
pip install -r scripts/requirements.txt
```

---

## 1. Create an Anthropic API key

1. Go to https://console.anthropic.com/ and sign up / log in.
2. Create an organization (e.g. "Repeat Precision") if you don't have one.
3. Add a payment method and a budget alert. With prompt caching, expected
   cost is roughly $20–60/month for ~30 questions/day.
4. **Settings → API keys → Create key.** Name it `rp-fieldtech-prod`.
5. Copy the key (starts with `sk-ant-api03-…`). You can only see it once.

Don't commit it. We'll store it as a Cloudflare secret in step 4.

---

## 2. Build the knowledge base

This converts every PDF and DOCX in the training guides folder into a single
TypeScript module that gets bundled with the worker.

```cmd
npm run build-knowledge
```

By default it reads from:

```
C:\Users\GrantMartin.AzureAD\OneDrive - RJ Machine\Documents\Claude\Projects\Field Tech Training Guides and Exams\
```

…and writes to `functions/_knowledge.ts`. To use a different source folder:

```cmd
python scripts/build-knowledge.py --source "path/to/folder"
```

The script reports per-document character counts and an approximate token
total. Sanity check: total tokens should land somewhere in the 100–400K
range for the current corpus. If a pumpdown chart PDF comes out empty or
gibberish (charts are graph-heavy and PDF→text doesn't always preserve
table structure), you'll see it in the warnings — you may need to manually
add a `.md` text version next to the PDF and re-run.

---

## 3. Test locally

```cmd
npm run dev
```

Open http://localhost:8788 in a browser. The chat will fail with a
configuration error until you provide the API key locally too:

Create `.dev.vars` in this folder (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Restart `npm run dev`, then try a question like:
*"What's the maximum vertical line speed?"* — should cite **ENG-TB-00041**.

---

## 4. Deploy to Cloudflare Pages

First-time setup (browser opens for OAuth):

```cmd
npx wrangler login
```

Create the Pages project and deploy:

```cmd
npm run deploy
```

The first deploy prompts for the project name — use `rp-fieldtech`. After
that the site is live at `https://rp-fieldtech.pages.dev` (or a unique
preview subdomain like `https://abc123.rp-fieldtech.pages.dev`).

Add the API key as a secret:

```cmd
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name=rp-fieldtech
```

…paste the `sk-ant-api03-…` key when prompted. The site won't work until
this is set.

---

## 5. Lock down access — Cloudflare Access + Entra ID SSO

Right now the URL is public. Lock it to @repeatprecision.com only.

### 5a. Enable Zero Trust on your Cloudflare account

1. Cloudflare dashboard → **Zero Trust** (left sidebar).
2. First time: pick a team name (e.g. `repeat-precision`). Choose the
   **Free** plan (covers up to 50 users).

### 5b. Register an Entra ID application

You'll need this in the Azure portal — you said you have rights to do this
in the RP tenant.

1. https://portal.azure.com/ → **Microsoft Entra ID** → **App registrations**
   → **New registration**.
2. Name: `RP Field Tech Assistant`. Supported account types: *single tenant*.
3. Redirect URI: **Web** + the callback URL Cloudflare gives you in step 5c
   below (looks like `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`).
   You can fill this in *after* you create the IdP in Cloudflare and copy
   the callback over.
4. After creating: copy the **Application (client) ID** and
   **Directory (tenant) ID** from the overview page.
5. **Certificates & secrets → New client secret.** Copy the secret value
   immediately (only shown once).
6. **API permissions → Add a permission → Microsoft Graph → Delegated →**
   add `email`, `openid`, `profile`. **Grant admin consent.**

### 5c. Add Entra ID as a Cloudflare IdP

1. Zero Trust dashboard → **Settings → Authentication → Login methods →
   Add new → Microsoft (Azure AD)**.
2. Paste the Application (client) ID, client secret, and tenant ID from step 5b.
3. Cloudflare shows you a redirect URL — copy it back into the Entra app
   registration's redirect URI list (step 5b.3) if you haven't already.
4. Click **Test** to verify the connection.

### 5d. Protect the Pages app

1. Zero Trust → **Access → Applications → Add an application →
   Self-hosted**.
2. Name: `RP Field Tech Assistant`.
3. Application domain: `rp-fieldtech.pages.dev` (or your custom domain).
4. Identity providers: enable **Microsoft (Azure AD)** only. Optionally
   disable the One-time PIN fallback.
5. Session duration: 24h is reasonable for field use.
6. **Add a policy → Allow**:
   - Action: Allow
   - Include: **Emails ending in** `@repeatprecision.com`
7. Save.

Now hit `https://rp-fieldtech.pages.dev` — it should redirect to Microsoft
login, then back to the chat UI.

---

## 6. Install on a tech's phone

iPhone / Safari:
1. Open the URL, sign in.
2. Tap **Share → Add to Home Screen**.
3. The icon appears like a native app; opens fullscreen.

Android / Chrome:
1. Open the URL, sign in.
2. Menu (⋮) → **Add to Home screen** or **Install app**.
3. Same fullscreen experience.

---

## 7. Updating documents

When training guides or bulletins change in the source OneDrive folder:

```cmd
npm run build-knowledge
npm run deploy
```

That's it — regenerates `functions/_knowledge.ts` and ships a new deploy.
Cloudflare Pages keeps the previous version for instant rollback.

---

## 8. Adjusting the bot's behavior

| File | What's in it |
|------|--------------|
| `functions/_system-prompt.ts` | The rules, tone, citation format, refusal message |
| `functions/api/chat.ts`       | Model choice (`MODEL`), max output tokens, API call |
| `public/index.html`           | Welcome text and header copy |
| `public/style.css`            | Colors (brand `#1E2D5B`), layout, dark mode |

To switch models: change `MODEL` in `functions/api/chat.ts`:
- `claude-haiku-4-5-20251001` — 3–5× cheaper, slightly less rigorous
- `claude-sonnet-4-6` — current default
- `claude-opus-4-7` — overkill for this use case, ~5× more expensive than Sonnet

---

## 9. Icons (todo)

The PWA manifest references `/icon-192.png` and `/icon-512.png` — these
don't exist yet, so on Android the install banner won't show until you add
them. Drop two PNGs (192×192 and 512×512) into `public/` whenever you
have a logo. The site otherwise works without them.

---

## 10. Cost monitoring

- **Anthropic Console → Usage** — track API spend. Set a budget alert.
- **Cloudflare dashboard → Pages → rp-fieldtech → Functions** — request
  count and CPU time. Free tier covers 100K requests/day.

Sonnet 4.6 with cached system prompt (~200K tokens):
- First request in a 5-min window: ~$0.60 (cache write)
- Subsequent requests in that window: ~$0.02–0.05
- 30 questions/day, spread across the day: $20–60/month

To reduce cost: switch to Haiku 4.5 (see section 8) or trim the corpus by
removing low-value docs.

---

## 11. Troubleshooting

**"ANTHROPIC_API_KEY secret is not configured."**
You haven't run `wrangler pages secret put ANTHROPIC_API_KEY …` yet (step 4),
or you're in local dev without a `.dev.vars` file (step 3).

**Empty or garbage text for a pumpdown chart PDF.**
`pymupdf4llm` can't read graph-heavy PDFs as tables. Create a `.md` text
version of the chart alongside the PDF and rebuild. The script picks up
both file types.

**Cloudflare Access prompts a tech for a OTP instead of Microsoft login.**
You forgot to disable the One-Time PIN fallback in the app's identity
provider list (step 5d.4).

**Wrangler hangs on `Resource temporarily unavailable`.**
You're running from `C:\Windows\System32`. `cd` into the project folder first.
