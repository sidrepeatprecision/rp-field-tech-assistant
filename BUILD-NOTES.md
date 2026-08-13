# RP Field Tech Assistant — Build Notes

A plain-English summary of how this project came together, the decisions
behind it, and the surprises along the way. The `README.md` covers
"how to operate it"; this file covers "why it is the way it is."

---

## What this is

A mobile web app at `https://rp-fieldtech.gmartin-be3.workers.dev/` that
lets Repeat Precision field techs ask plain-language questions about
PurpleSeal™ / PurpleReign™ products, pumpdown rates, WLAK components,
shear ratings, setting tools, and procedures. Claude Sonnet 4.6 answers
using the company's training guides, technical bulletins, and field
service manuals as cached context, citing the source document in every
answer.

Access is gated by Cloudflare One-Time PIN — only `@repeatprecision.com`
email addresses can sign in.

---

## How we got here

### The original ask

Started as "can you create a project folder for me from a Claude project
in the desktop app?" Goal was to mirror a Claude.ai / Cowork project
into a local folder so it could be opened in Claude Code.

### False starts before the real ask emerged

1. **Tried claude.ai data export first.** Requested the personal data
   export from claude.ai settings. When the ZIP arrived it contained
   chat conversations and chat-style Projects, but **NOT** Cowork data.
   Cowork is a separate product not included in the standard export.
   The ten projects in the export were unrelated to the target.
2. **Found the actual project via OneDrive.** The Cowork project
   ("Field Tech Training Guides and Exams") was already synced locally
   via OneDrive at
   `C:\Users\GrantMartin.AzureAD\OneDrive - RJ Machine\Documents\Claude\Projects\`.
   That folder is the source of truth for the docs.
3. **Deleted the empty mirror folder** we'd created based on the wrong
   assumption.

### The real project: a web-based field assistant

You then asked for a web-based agent for techs to use on their phones.
We scoped it together via a series of clarifying questions:

- Internal RP techs, Microsoft 365 SSO (later changed to OTP because
  Entra admin wasn't available)
- Refuse out-of-scope questions; cite source documents
- Text only (no voice/photo for v1)
- Cloudflare Pages + Workers
- Sonnet 4.6 model
- Free workers.dev subdomain, no persistence

That scoping took ~10 minutes and saved a lot of rework later.

---

## The architecture we built

```
Mobile browser
    ↓ HTTPS
Cloudflare One-Time PIN  ←  emails 6-digit code to @repeatprecision.com
    ↓ (authenticated)
Cloudflare Worker (rp-fieldtech)
    ├─ Routes /api/chat → src/chat.ts → Anthropic API
    └─ Everything else → static files in public/

GitHub repo → GitHub Actions → wrangler deploy on every push to main
```

**Knowledge base:** PDFs and DOCX from the OneDrive training folder are
converted to Markdown via `scripts/build-knowledge.py`, stitched into
one big string in `src/knowledge.ts`, and bundled with the Worker. At
runtime, the Worker sends this corpus to Claude as a cached system
prompt — so each tech's question gets answered against the full
document set without RAG, vector DBs, or chunking.

**Why no RAG?** Corpus is ~75K tokens after stripping image base64.
Fits comfortably in Sonnet's 200K context. Prompt caching makes
sending the whole corpus per query cheap (~$0.02 cached, ~$0.20 cache
miss). Vastly simpler than building retrieval.

---

## Gotchas we hit (these will bite future-you if you redo this)

### Windows on ARM64 + OneDrive

Your machine is Windows on ARM (Snapdragon). Cloudflare's `wrangler` has
no Windows-ARM64 binary because `workerd` doesn't ship one. We worked
around this by deploying via GitHub Actions on Linux runners, never
running wrangler locally.

Also: `node_modules` and OneDrive don't mix. OneDrive locks files
mid-install and breaks `npm install` with `EBUSY` errors. The project
lives at `C:\Users\GrantMartin.AzureAD\Projects\` — outside OneDrive —
for this reason.

### Cloudflare Pages vs Workers UI consolidation

When we started, Cloudflare's "Pages" product was the natural fit. By
the time we deployed, the dashboard had merged Pages into Workers with
Static Assets. We restructured mid-build:

- Original: `functions/api/chat.ts` (Pages-style)
- Final: `src/index.ts` + `src/chat.ts` (Workers-style)
- `wrangler.toml` uses `[assets]` block with `run_worker_first = true`
  so `/api/chat` actually routes to the Worker before static assets
  intercept it.

### Dashboard secrets get wiped on Git auto-deploy

The single biggest time-sink. Cloudflare's Git auto-deploy replaces all
Worker bindings with what's declared in `wrangler.toml` — meaning the
`ANTHROPIC_API_KEY` we set in the dashboard got wiped on every push.
Diagnosed via a temporary `/api/debug` endpoint that printed env keys.

**Fix:** disabled Cloudflare's Git auto-deploy and switched to a
GitHub Actions workflow that runs `wrangler secret put` before each
`wrangler deploy`. Secret values live as GitHub repository secrets
(`ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

`keep_vars = true` in wrangler.toml is supposed to preserve dashboard
vars across deploys but didn't work in our setup.

### Mammoth converts Word images to base64

First build of the knowledge corpus came out at 720K tokens (way over
Sonnet's 200K window). Cause: `mammoth` was inlining every embedded
image in the docx files as a giant base64 data URI in the markdown
output. The L1 training guide alone was 1.45M characters because of
this.

**Fix:** in `build-knowledge.py`, pass a no-op `convert_image` handler
to mammoth + post-process with regex to catch any escapees. Corpus
dropped to 300K characters / 75K tokens.

### Cloudflare Access OTP didn't deliver — turned out to be a policy rule mistake

The login page appeared, codes never arrived, no logs were generated,
nothing in M365 quarantine. Looked like a delivery problem; wasn't.

**Cause:** the policy was set to "Emails" (requires exact match) instead
of "Emails ending in" (matches domain). Cloudflare silently blocked
the request before issuing an OTP — that's why no email AND no log.

This is now in the README troubleshooting section.

---

## How to maintain it (short version — see README for detail)

When docs change in the OneDrive training folder:

```powershell
cd "C:\Users\GrantMartin.AzureAD\Projects\rp-fieldtech-assistant"
python scripts/build-knowledge.py
git add src/knowledge.ts
git commit -m "Update knowledge base — <what changed>"
git push
```

GitHub Actions deploys in ~60 seconds. Watch progress at
`github.com/WGrantMartin/rp-fieldtech-assistant/actions`.

To change bot behavior (rules, tone, citations): edit
`src/system-prompt.ts`, push.

To change model: edit `MODEL` constant in `src/chat.ts`, push.

To watch costs: https://console.anthropic.com/ → Usage tab. All techs'
questions roll up to one bill on your account.

---

## What we discussed but didn't build

Open ideas you mentioned interest in but we deferred:

- **Linked PDF citations.** When the bot says "Source: ENG-TB-00041",
  make it a clickable link to the PDF. Would copy source PDFs into
  `public/docs/` during build, include URL hint in corpus, instruct
  the model to format citations as Markdown links. ~10-minute change.
- **Per-tech usage attribution.** Pass the signed-in tech's email from
  Cloudflare Access into Anthropic's `metadata.user_id` field so the
  usage dashboard can break down spend by user.
- **Auto-rebuild on doc changes.** Currently you run
  `build-knowledge.py` manually. Options range from a double-clickable
  `.bat` file (5 min) to Power Automate triggering GitHub workflows on
  SharePoint events (1–2 hr).
- **Markdown source files.** Currently the build only reads PDFs and
  DOCX. Adding `.md` support would let you drop in hand-written notes,
  corrections, or FAQs without needing to wrap them in Word first.
- **Long-term auth via Entra ID SSO.** When IT can register an Entra
  app, swap from OTP to true single-sign-on. Detailed steps already
  exist in an earlier draft of the README.
- **Voice input + photo upload** for hands-busy rig work. Web Speech
  API + Claude vision. Not needed for v1.

---

## Files of interest

| Path | What's in it |
|------|--------------|
| `src/index.ts` | Worker entry, routing |
| `src/chat.ts` | Anthropic API call + SSE streaming |
| `src/system-prompt.ts` | Bot rules, refusal message, citation format |
| `src/knowledge.ts` | Auto-generated corpus (don't hand-edit) |
| `public/index.html`, `style.css`, `app.js` | Mobile chat UI |
| `scripts/build-knowledge.py` | PDF/DOCX → knowledge.ts converter |
| `wrangler.toml` | Worker config |
| `.github/workflows/deploy.yml` | GH Actions deploy pipeline |
| `README.md` | Operational guide |

---

## Counterpart projects

- **Source documents:**
  `C:\Users\GrantMartin.AzureAD\OneDrive - RJ Machine\Documents\Claude\Projects\Field Tech Training Guides and Exams\`
- **GitHub repo:** https://github.com/WGrantMartin/rp-fieldtech-assistant
- **Deployed bot:** https://rp-fieldtech.gmartin-be3.workers.dev/
- **Cloudflare Worker:** dash.cloudflare.com → Workers & Pages → rp-fieldtech
- **Anthropic API:** console.anthropic.com (key `rp-fieldtech-prod`)
- **Zero Trust:** dash.cloudflare.com → Zero Trust → Access → Applications
