# Implementation Plan — monday.com Knowledge Source + Sonnet 5

Draft plan for sourcing the Field Tech Assistant's knowledge base from monday.com
instead of (or in addition to) the OneDrive training folder, auto-rebuilding it
when the boards change, and upgrading the model to Claude Sonnet 5.

> Status: **draft for review.** Nothing here is built yet. Decisions marked
> **[DECIDE]** need your input before the relevant phase starts.

---

## 1. Goal

- Pull the reference corpus from two monday.com boards — **RP Document Library**
  and **Master Parts List** — plus the **"Field Technician AI — Directory Skills
  Catalog"** monday Doc.
- Parse once into the existing static `src/knowledge.ts` bundle (no per-question
  re-parsing; the corpus already rides in a cached context block).
- Rebuild automatically when the boards change, via a full re-parse (not
  incremental patching — the corpus is small enough that a clean rebuild is
  simpler and drift-free).
- Upgrade the model from Claude Sonnet 4.6 to Claude Sonnet 5.

## 2. Current vs. target architecture

**Today**
```
OneDrive training folder ──(manual: python build-knowledge.py)──▶ src/knowledge.ts
                                                                        │ git push
                                                                        ▼
                                                          GitHub Actions ▶ Cloudflare Worker
```

**Target**
```
monday boards + Directory Skills Catalog doc
        │  (monday GraphQL API)
        ▼
build-knowledge.py  ──▶ src/knowledge.ts ──git push/commit──▶ GitHub Actions ▶ Worker
        ▲
        │ triggered automatically
monday webhook ──▶ Worker relay route ──▶ GitHub repository_dispatch
```

The deploy half (GitHub Actions → Worker) is unchanged. We're changing where the
corpus comes from and adding an automatic trigger.

## 3. Prerequisites (before Phase 1)

- **monday API token** with read access to the two boards, their items, item
  updates, and file assets, and read access to the catalog Doc. (This is the one
  hard dependency — everything else is code.)
- **GitHub secret** `MONDAY_API_TOKEN` added to the repo's Actions secrets
  (same place as `ANTHROPIC_API_KEY` — see [HANDOFF.md](HANDOFF.md) §2).
- Confirm the target Anthropic org/key still applies (no change expected).

---

## Phase 0 — Discovery & schema mapping ✅ DONE

**Output:** [scripts/monday-config.json](scripts/monday-config.json) — board IDs,
column allow-lists, groups, status filters, and content-source rules.

**Key findings (these reshape Phase 1):**
- IDs: RP Document Library `18417663477` (45 items) · Master Parts List
  `18408235123` (195 items, subitems board `18408252136`) · Catalog Doc
  `18424921270` · workspace `6801515`.
- **The boards are built for a monday-native "Field Technician AI" agent.** The
  Catalog Doc is a set of "directory skills" teaching that agent about the
  boards; those skills say *"never open the files — answer from the fields."*
  See the strategic note in §6.
- **Full document text already lives in each Document-Library item's Updates
  thread**, put there by monday's existing "Extract File Data" workflow. The
  columns hold only metadata + an extraction log. → **We consume monday's
  extraction; we do NOT parse PDFs ourselves.**
- A few items have no extraction yet (empty log + no updates). The fix is to run
  monday's extract button on them, not to add a PDF parser to our pipeline.
- Master Parts List is clean structured data with no attachments. The WLAK
  group's "deeper detail" (per the catalog) was NOT present in sampled items —
  verify before relying on subitems there.
- Rough size: MPL ≈ 15–20K tokens; Document-Library full text ≈ the current
  OneDrive corpus (~97K tokens on Sonnet 5's heavier tokenizer). Total ≈
  115–130K tokens — fits the cached context, but with less headroom than
  "trivially small." Measure precisely with `count_tokens` in Phase 1.

<details><summary>Original Phase 0 task list (for reference)</summary>

**Why:** we can't write correct queries until we know the boards' real structure.
This phase produces a small config file the build script reads.

**Tasks**
1. Locate the workspace and record the IDs of both boards and the catalog Doc.
2. For each board, record: group IDs, and for every column its `id`, `title`,
   and `type` (text, long-text, status, numbers, files, etc.).
3. Identify **which columns carry answer-relevant content** vs. noise (internal
   status, assignees, timestamps).
4. Read the Directory Skills Catalog Doc and decide how it drives parsing —
   whether it names the boards/columns to include, or is simply included as
   orienting context in the corpus. **[DECIDE]**
5. Measure size: item counts per board + rough character total, to confirm the
   corpus still fits comfortably in context (target well under ~150K tokens).

**Deliverable:** `scripts/monday-config.json` — board IDs, doc ID, and the
allow-list of columns to extract per board.

> This phase can be done immediately against the live workspace using the
> connected monday tools — see "Immediate next step" at the bottom.

</details>

---

## Phase 1 — monday.com fetch + convert layer

**Why:** replace/augment the filesystem walk in `build-knowledge.py` with a
monday data source, emitting the same corpus format.

**Design**
- Add a monday GraphQL client (reads `MONDAY_API_TOKEN` from the environment).
- Fetch, per the Phase 0 config:
  - **Directory Skills Catalog Doc** → drives which boards/columns get parsed
    (the config is derived from it) AND is included in the corpus as its own
    `=== SOURCE: ... ===` orienting section. *(Decision: index + context.)*
  - **Board items** → for each item, assemble a text block from the allow-listed
    **column values**, the item's **Updates thread** (where the Document
    Library's full extracted text lives), the **Notes/long-text** column, and —
    for MPL WLAK items — the **item description + subitems**. *(Decision: read
    both Updates and columns; confirmed load-bearing by Phase 0.)*
  - **Missing-extraction handling (revised by Phase 0)** → we do **not** parse
    attachments. Phase 0 showed monday's own "Extract File Data" workflow already
    posts full file text to Updates, so our build just consumes it. If an item
    has thin text (empty Updates **and** empty extraction log — the < 500-char
    case), we **flag it in the build log** for an owner to run the monday extract
    button, rather than adding a PDF parser. This keeps a single extraction path
    and avoids drift. *(Refines the earlier "parse the attachment" decision — see
    §6 note 3.)*
- Emit into the same `=== SOURCE: <title> ===` corpus format so nothing
  downstream (chat.ts, caching) changes.
- **Source of truth: monday only.** *(Decision.)* monday boards + the catalog
  Doc become the sole source; the OneDrive path is retired. Keep the OneDrive
  converter code in place until a monday-built corpus is verified to cover the
  material (Phase 1 testing), then remove it.

**Representative query shape** (exact column IDs come from Phase 0):
```graphql
query ($boardId: [ID!]) {
  boards(ids: $boardId) {
    items_page(limit: 100) {
      cursor
      items {
        id
        name
        column_values { id text value }
        updates { text_body }
        assets { name public_url file_extension }
      }
    }
  }
}
```
(Pagination via `cursor` for boards over 100 items.)

**Testing**
- Run locally with a read token; diff the generated `knowledge.ts` against the
  current OneDrive-built one to sanity-check coverage and size.
- Spot-check a few known Q&A pairs against the bot before/after.

---

## Phase 2 — Claude Sonnet 5 upgrade

Small and independent of the monday work; can ship first if desired.

- `src/chat.ts`: change `MODEL` from `"claude-sonnet-4-6"` to `"claude-sonnet-5"`.
- **Thinking: disabled.** *(Decision.)* On Sonnet 5, omitting the `thinking`
  field now runs adaptive thinking by default, so set it explicitly:
  `thinking: { type: "disabled" }` in the request body in `chat.ts`. Keeps
  answers fast for on-rig use; revisit only if answer quality dips.
- Update the "Claude Sonnet 4.6" references in README/BUILD-NOTES.
- Note: Sonnet 5's tokenizer runs ~30% higher than 4.6, so the ~75K-token corpus
  becomes ~97K — still trivially within context; only nudges cache-write cost.
  Intro pricing $2/$10 per MTok through 2026-08-31, then $3/$15.

**Testing:** one live question, confirm `response.model` reports Sonnet 5 and
answers/citations look right.

---

## Phase 3 — Automatic rebuild on board changes ✅ BUILT

**Flow:** monday board change → `POST /api/monday-webhook?token=…` (Worker relay)
→ GitHub `repository_dispatch` → `rebuild-knowledge.yml` → rebuild `knowledge.ts`
from monday → commit → deploy Worker. A nightly cron re-runs regardless, so a
missed webhook self-heals within a day. A burst of edits collapses into one run
via the workflow's `concurrency` group (no Worker-side debounce needed).

**Code added:**
- [src/monday-webhook.ts](src/monday-webhook.ts) — the relay (challenge
  handshake, `?token=` auth, GitHub `repository_dispatch`).
- [src/index.ts](src/index.ts) — routes `POST /api/monday-webhook`; Env gains
  `MONDAY_WEBHOOK_SECRET`, `GH_DISPATCH_TOKEN`, `GH_REPO`.
- [.github/workflows/rebuild-knowledge.yml](.github/workflows/rebuild-knowledge.yml)
  — `repository_dispatch` + nightly + manual; builds, commits, deploys.
- `deploy.yml` left as-is (code-push deploys); the rebuild workflow re-asserts
  the Worker secrets, and code deploys don't clobber them.

### One-time setup (needs your accounts)

1. **Create a GitHub PAT** with `contents: write` on the repo (fine-grained:
   Contents = Read and write). This is `GH_DISPATCH_TOKEN`.
2. **Add these repo Actions secrets** (Settings → Secrets and variables →
   Actions). Note the `GH_` prefix — GitHub forbids secrets starting with
   `GITHUB_`:
   - `MONDAY_API_TOKEN` — read-scoped monday token (the build step uses it)
   - `MONDAY_WEBHOOK_SECRET` — any long random string you choose
   - `GH_DISPATCH_TOKEN` — the PAT from step 1
   - `GH_REPO` — `WGrantMartin/rp-fieldtech-assistant`
   - (already present: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
     `ANTHROPIC_API_KEY`)
3. **Run the rebuild workflow once manually** (Actions → "Rebuild knowledge
   base" → Run workflow). This deploys the new Worker route and pushes the
   webhook secrets onto the Worker.
4. **Register the monday webhooks** on both boards, pointing at
   `https://rp-fieldtech.<handle>.workers.dev/api/monday-webhook?token=<MONDAY_WEBHOOK_SECRET>`.
   Recommended events per board: `create_item`, `change_column_value`,
   `create_update` (the extraction posts full text as an update). This can be
   done via the monday API — see the mutations below; I can run them once the
   Worker is deployed (the endpoint must answer the challenge, so deploy first).

```graphql
# One per (board, event). Repeat for board 18408235123 (Master Parts List).
mutation {
  create_webhook(
    board_id: 18417663477,
    url: "https://rp-fieldtech.<handle>.workers.dev/api/monday-webhook?token=<SECRET>",
    event: change_column_value
  ) { id board_id }
}
```

**Testing:** edit a test item in monday → confirm a "Rebuild knowledge base"
run fires in Actions → confirm the change appears in the bot after deploy (~1–2
min). Or trigger manually via workflow_dispatch to test without a webhook.

---

## Phase 4 — System prompt refinement

Deferred until you review the current prompt in
[src/system-prompt.ts](src/system-prompt.ts). Likely touch-ups once monday is
the source: how to cite monday items vs. document codes, and how to use the
Directory Skills Catalog as an index. No work until your review.

---

## 4. Sequencing

| Order | Phase | Depends on | Ship independently? |
|------:|-------|------------|---------------------|
| 1 | Phase 2 — Sonnet 5 | nothing | ✅ yes, do first |
| 2 | Phase 0 — Discovery | monday token | ✅ |
| 3 | Phase 1 — Fetch layer | Phase 0 | ✅ (manual rebuilds) |
| 4 | Phase 3 — Auto-rebuild | Phase 1 | ✅ |
| 5 | Phase 4 — Prompt | Phase 1 | ✅ |

Sonnet 5 is a clean quick win to land first. Then Discovery → Fetch gets the
data flowing (with manual rebuilds), and Auto-rebuild layers on last.

## 5. Risks & mitigations

- **monday text is too sparse without attachments** → the fallback-to-PDF path
  (Phase 1) covers this; tune the "thin content" threshold in testing.
- **Corpus grows past context budget later** → Phase 0 measures size; if it ever
  approaches the limit, revisit retrieval/RAG (out of scope now).
- **Missed webhook** → nightly scheduled rebuild self-heals.
- **Secrets sprawl** → GitHub token lives only as a Worker secret; monday token
  only as a GitHub Actions secret. Neither in source.
- **OneDrive/ARM local-build constraint** → all builds run in GitHub Actions
  (Linux), never locally; consistent with the existing setup.

## 6. Resolved decisions

All five settled — the phases above reflect these:

1. **Catalog Doc:** index **+** context — it drives what gets parsed and is also
   included in the corpus.
2. **Source of truth:** **monday only** (OneDrive retired after coverage is
   verified in Phase 1 testing).
3. **"Thin content" threshold:** < **500 chars** of text now *flags an item for
   monday re-extraction* rather than triggering PDF parsing — Phase 0 found the
   board already extracts file text into Updates, so our build consumes that
   instead of re-parsing. **[CONFIRM]** this refinement.
4. **Sonnet 5 thinking:** **disabled** (fast), set explicitly in `chat.ts`.
5. **Item content:** read **both** the Updates thread **and** a notes/long-text
   column (identified in Phase 0), alongside the allow-listed columns.

### Strategic note surfaced by Phase 0 — worth a decision

The Catalog Doc shows Repeat Precision is **already building a monday-native
"Field Technician AI" agent**: the "directory skills" are being written to teach
*that* agent about these boards, and the boards carry a purpose-built file
extraction workflow. Those skills are "not yet attached to an agent," with an
open item to "decide sidekick vs. agent."

That means this Cloudflare Worker bot and the monday-native agent are two paths
to the same goal. Before investing in Phases 1 & 3, worth deciding:

- **Keep the Worker bot** and feed it monday data (this plan). Advantage: the
  installable phone PWA + Cloudflare Access SSO already exist and work offline of
  monday's UI.
- **Pivot to the monday-native agent** and retire this repo. Advantage: no
  separate corpus/deploy pipeline; answers straight from live boards.
- **Both**, deliberately — e.g. the Worker bot for field phones, the monday
  agent for internal desktop use.

This doesn't block Phase 2 (Sonnet 5, already shipped) but it *should* be settled
before Phase 1 build work starts. **[DECIDE]**

## 7. Immediate next step

The monday workspace is connected via tools right now, so **Phase 0 can start
immediately** — I can locate the two boards + the catalog Doc, dump their column
schemas and sizes, and turn that into `scripts/monday-config.json`. That both
de-risks the plan and produces the config Phase 1 needs. Say the word and I'll
run Phase 0 discovery (read-only).
