# RP Field Tech Assistant — Handoff

Handoff doc for transferring ownership of this project from **Grant Martin
(`gmartin@repeatprecision.com`)** to a new maintainer.

> **Fill in before sending:** replace `<new-owner-name>` and
> `<new-owner@repeatprecision.com>` throughout, and set the handoff date.
>
> - **New owner:** `<new-owner-name>` — `<new-owner@repeatprecision.com>`
> - **Handoff date:** `<YYYY-MM-DD>`
> - **Outgoing owner remains reachable at:** `gmartin@repeatprecision.com` for
>   `<N>` weeks after the handoff date.

---

## Read these first, in order

The operational knowledge is already in the repo — this file only covers the
transfer itself. Before you touch anything, read:

1. **`README.md`** — how to operate the system (build knowledge, deploy,
   troubleshoot). Sections 6–9 are the day-to-day.
2. **`BUILD-NOTES.md`** — why it's built the way it is. Read the "Gotchas
   we hit" section in particular — those problems will bite again if
   the setup ever needs to be rebuilt.

If those two make sense, you know 95% of the system.

---

## What you're inheriting

- **Live service:** https://rp-fieldtech.gmartin-be3.workers.dev/
- **GitHub repo:** https://github.com/WGrantMartin/rp-fieldtech-assistant
- **Deploy flow:** `git push main` → GitHub Actions → Cloudflare Worker, ~1–2 min
- **Auth:** Cloudflare Zero Trust One-Time PIN to `@repeatprecision.com` addresses
- **Model:** Claude Sonnet 5 via Anthropic API
- **Knowledge corpus:** built by `scripts/build-knowledge.py` from PDFs/DOCX in
  the OneDrive training guides folder; occasional hand-typed `.md` companions
  for graph-heavy chart PDFs.

Full architecture diagram is in `BUILD-NOTES.md`.

---

## Access transfer checklist

Do these in order. Each row is "outgoing owner does X, new owner confirms Y."

### 1. GitHub repo — `WGrantMartin/rp-fieldtech-assistant`

- [ ] **Outgoing:** Settings → Collaborators → add `<new-owner GitHub handle>`
      with **Admin** role. (Admin is required so they can manage repo secrets
      and workflows.)
- [ ] **Outgoing (if fully leaving):** Settings → General → Transfer ownership
      to `<new-owner GitHub handle>` **OR** to a `repeatprecision` org if one
      exists. Update the URL references in README/BUILD-NOTES afterward.
- [ ] **New owner:** clone the repo to a **non-OneDrive** path
      (e.g. `C:\Users\<you>\Projects\rp-fieldtech-assistant`) — OneDrive
      breaks `node_modules`. See README section 0.
- [ ] **New owner:** confirm you can view Settings → Secrets and variables → Actions.

### 2. GitHub Actions Repository Secrets

Three secrets live here; do NOT delete or rotate anything until the new owner
has replacements ready.

| Secret | Current value source | Action |
|---|---|---|
| `ANTHROPIC_API_KEY` | Grant's Anthropic org, key `rp-fieldtech-prod` | See step 3 |
| `CLOUDFLARE_API_TOKEN` | Grant's Cloudflare account | See step 4 |
| `CLOUDFLARE_ACCOUNT_ID` | Grant's Cloudflare account | See step 4 |

- [ ] **New owner:** confirm all three secrets are present at
      github.com/WGrantMartin/rp-fieldtech-assistant/settings/secrets/actions
      (values are hidden — you can only see names).

### 3. Anthropic Console — https://console.anthropic.com/

Decide: are you *sharing* the API bill, or is the bill moving?

- [ ] **If sharing (both continue on same org):** outgoing owner invites
      `<new-owner@repeatprecision.com>` to the Anthropic organization,
      Admin role.
- [ ] **If moving:** new owner creates their own Anthropic org, adds a
      payment method + budget alert, creates a new API key named
      `rp-fieldtech-prod`, and replaces `ANTHROPIC_API_KEY` in GitHub
      Actions Secrets. Next `git push` picks it up. Outgoing owner
      revokes the old key **only after a successful test deploy.**

### 4. Cloudflare — https://dash.cloudflare.com/

The Worker, Access policy, DNS (if any), and account-level API token all live
here. Choose the same "share vs. move" decision as step 3.

- [ ] **If sharing:** outgoing owner → Manage Account → **Members → Invite** →
      `<new-owner@repeatprecision.com>` with **Super Administrator** role
      (or **Administrator** if you want to withhold billing).
- [ ] **If moving:** the Worker and Zero Trust config would need to be
      re-created under the new owner's account (this is non-trivial — the
      workers.dev URL would change, and Access needs a fresh Entra/OTP
      setup). **Recommend sharing instead** unless there's a policy reason
      to move accounts.
- [ ] **New owner:** verify you can see the `rp-fieldtech` Worker under
      Workers & Pages and open its logs.
- [ ] **New owner (if generating a fresh CF API token):** dashboard → My
      Profile → API Tokens → Create Token → "Edit Cloudflare Workers"
      template → scope to your account. Copy into GitHub Actions secret
      `CLOUDFLARE_API_TOKEN`.

### 5. Cloudflare Zero Trust — Access policy

The Access policy currently allows `emails ending in @repeatprecision.com`,
so the new owner's `@repeatprecision.com` account can already sign in — no
edit required unless you're narrowing/expanding scope.

- [ ] **New owner:** hit https://rp-fieldtech.gmartin-be3.workers.dev/, sign
      in with the OTP flow, ask the bot a question. Confirms end-to-end
      auth + API path works for you.

### 6. Source documents folder

- [ ] The training corpus lives in OneDrive at:
      `C:\Users\GrantMartin.AzureAD\OneDrive - RJ Machine\Documents\Claude\Projects\Field Tech Training Guides and Exams\`
- [ ] **New owner:** confirm you have access to the shared OneDrive location
      (or its `<new-owner>` equivalent). Update `scripts/build-knowledge.py`'s
      default `--source` path if your local path differs.

### 7. Optional — Claude Code project memory

If you use Claude Code with this repo, there's project-scoped memory at
`~/.claude/projects/…-rp-fieldtech-assistant/memory/`. It contains half a
dozen small facts about the deploy URL, canonical path, chart-PDF fix
pattern, Windows-ARM caveat, etc.

- [ ] **New owner (optional):** copy those `.md` files into your own
      `~/.claude/projects/…/memory/` after you first open the repo in
      Claude Code. Not required — Claude Code will rebuild memory over
      time from conversation.

---

## New owner: day-one checklist

Before you consider yourself operational:

1. Read `README.md` end-to-end.
2. Read `BUILD-NOTES.md` — especially the "Gotchas" section.
3. Confirm all seven checkboxes above.
4. Do a **no-op deploy** to prove your credentials work:
   ```powershell
   cd C:\Users\<you>\Projects\rp-fieldtech-assistant
   # trivial change — bump a comment or the README
   git commit -am "handoff: verify deploy access as <new-owner>"
   git push
   ```
   Watch the deploy at
   `github.com/WGrantMartin/rp-fieldtech-assistant/actions`. It should
   turn green in ~60 seconds. Then hit the live URL and confirm the site
   still works.
5. Do a **content update dry-run**: pick one training doc, edit it slightly
   in the source folder, run `python scripts/build-knowledge.py`, commit
   `src/knowledge.ts`, push, verify the bot reflects the change.

If all five pass, you own it.

---

## What to rotate (if outgoing owner is fully leaving)

Only rotate **after** the new owner has completed the day-one checklist above.

- [ ] Anthropic API key `rp-fieldtech-prod` — revoke old, new one in place
- [ ] Cloudflare API token used by GitHub Actions — delete old, new one in place
- [ ] Outgoing owner's Cloudflare account role → remove or downgrade
- [ ] Outgoing owner's Anthropic org membership → remove
- [ ] Outgoing owner's GitHub collaborator role → remove (or transfer repo
      ownership away entirely)

Rotation order matters: **new credentials in, verified working, then old
credentials revoked** — never the reverse.

---

## Known open items (from `BUILD-NOTES.md` § "What we discussed but didn't build")

None of these are blockers. Left here so you can decide whether to prioritize:

- Linked PDF citations in bot answers
- Per-tech usage attribution via `metadata.user_id`
- Automated knowledge rebuild on doc changes
- Entra ID SSO to replace OTP
- Voice input + photo upload

---

## Contact

- **Outgoing owner:** Grant Martin — `gmartin@repeatprecision.com`
- **Expect responses within:** `<N>` business days, for `<N>` weeks after handoff
- **After that:** the project is yours. `BUILD-NOTES.md` is the canonical
  record of every non-obvious decision.
