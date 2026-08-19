# Level 1 Exam Scorecard — RP-EXAM-L1-001

**Final result: 45/45 (100%) on all answerable questions.** (Overall 45/59 — the
14 unscored points are the Part D "name the part in this photo" questions, which
a text-only assistant cannot answer.)

- First run (monday corpus only): **30/59** — see git history.
- Fix applied: added `scripts/supplemental/RP-TRN-L1-001_Level1_Training_Guide.md`.
- Method: deployed config reproduced exactly (`claude-sonnet-5`, live
  `system-prompt.ts` + `knowledge.ts`, thinking disabled, `max_tokens` 1024),
  one call per question, graded against the exam's own answer key. The assistant
  never saw the answer key.

| Part | Score |
|---|---|
| A — Multiple choice (Q1–10) | 20/20 |
| B — Short answer (Q11–13) | 15/15 |
| C — Component ID from text (Q14–18) | 10/10 |
| D — WLAK photo ID (Q19–25) | 0/14 — image-based, out of scope for a text bot |
| **Answerable total (A+B+C)** | **45/45 (100%)** |

| Q | Correct | Assistant | ✓ |
|---|---|---|---|
| 1 | B | B — zero metallic, all composite | ✓ |
| 2 | C | C — 10,000 psi | ✓ |
| 3 | C | C — remove from service | ✓ |
| 4 | C | C — 5 shear screws (5.5") | ✓ |
| 5 | C | C — 5 in. stroke | ✓ |
| 6 | B | B — hand-tighten + 0.25–0.50 turn | ✓ |
| 7 | C | C — 425 PSC standard for 5.5" 20# | ✓ |
| 8 | C | C — discard, use new assembly | ✓ |
| 9 | B | B — protect composite from moisture/sun | ✓ |
| 10 | C | C — 2 bbl./min | ✓ |
| 11 | 4 components + criteria | slips/bands/body/cones with criteria | ✓ 5/5 |
| 12 | anti-preset mechanism + consequence | prevents sleeve until 5,000 lbf; else premature preset | ✓ 5/5 |
| 13 | 438 in 5.5"23# not approved; use 425 | firm "No"; must not be used; 425 is correct | ✓ 5/5 |
| 14 | B (rubber element = #3) | B | ✓ |
| 15 | D (anti-extrusion fins = #4) | D | ✓ |
| 16 | B (inner/outer element) | B | ✓ |
| 17 | D (top slip = #7) | D | ✓ |
| 18 | C (ceramic buttons + slip bands not dissolvable) | C | ✓ |
| 19–25 | (WLAK photo ID) | not answerable — no image input | — |
