# Level 3 Exam Scorecard — RP-EXAM-L3-001

**Final result: 40/40 (100%) — PASS** (pass mark = 32/40, 80%).

- First run (monday + L1 + L2 guides only): **20/40 (50%)** — see git history.
- Fix applied: added `scripts/supplemental/RP-TRN-L3-001_Level3_Training_Guide.md`.
- Method: deployed config reproduced exactly (`claude-sonnet-5`, live
  `system-prompt.ts` + `knowledge.ts`, thinking disabled, `max_tokens` 1024),
  one call per question, graded against the exam's own answer key. The assistant
  never saw the answer key.

| Part | Score |
|---|---|
| A — Multiple choice (Q1–10) | 20/20 |
| B — Short answer (Q11–14) | 20/20 |
| **Total** | **40/40 (100%)** |

| Q | Correct | Topic | ✓ |
|---|---|---|---|
| 1 | B | Haynesville frac-plug approval (ENG-TB-00029) | ✓ |
| 2 | C | Mill/bit OD 95–98% of drift | ✓ |
| 3 | B | WOB 1,000–3,000 lb | ✓ |
| 4 | C | CAP bridge plug PN 22502 | ✓ |
| 5 | B | Tension loss 50–450 lb; wait & assess | ✓ |
| 6 | C | StageSaver 3,750 psi 3-pin (ENG-TB-00038) | ✓ |
| 7 | B | PurpleReign shaft tail pipe wedges in forks | ✓ |
| 8 | B | 10–15 bbl HCl, 3–4 hr | ✓ |
| 9 | B | 438 less clearance than 425 | ✓ |
| 10 | B | Anti-preset screw required with non-RP tool (ENG-TB-00024) | ✓ |
| 11 | Tool-trap fit check + risk assessment + clear forks | ✓ 5/5 |
| 12 | Three preset root causes + specific fixes | ✓ 5/5 |
| 13 | Fired-but-unset: document, inspect power charge, inspect igniter | ✓ 5/5 |
| 14 | StageSaver ENG-TB-00038 change (what/rating/inventory/when 4-pin) | ✓ 5/5 |

The 20 points recovered from the first run were all L3-guide + referenced
ENG-TB bulletin content (00029, 00031, 00038, 00024) that was absent from the
corpus until the Level 3 guide was added as a supplemental source. The first
run produced zero hallucinations — every gap was a clean refusal or an explicit
"documentation gap" flag, not a wrong confident answer.
