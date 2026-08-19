# Level 2 Exam Scorecard — RP-EXAM-L2-001

**Final result: 40/40 (100%) — PASS** (pass mark = 32/40, 80%).

- First run (monday + L1 guide only): **28/40 (70%)** — see git history.
- Fix applied: added `scripts/supplemental/RP-TRN-L2-001_Level2_Training_Guide.md`.
- Method: deployed config reproduced exactly (`claude-sonnet-5`, live
  `system-prompt.ts` + `knowledge.ts`, thinking disabled, `max_tokens` 1024),
  one call per question, graded against the exam's own answer key. The assistant
  never saw the answer key.

| Part | Score |
|---|---|
| A — Multiple choice (Q1–10) | 20/20 |
| B — Short answer (Q11–14) | 20/20 |
| **Total** | **40/40 (100%)** |

| Q | Correct | ✓ |
|---|---|---|
| 1 | B | ✓ |
| 2 | C | ✓ |
| 3 | C | ✓ |
| 4 | C | ✓ |
| 5 | B | ✓ |
| 6 | B | ✓ |
| 7 | C | ✓ |
| 8 | B | ✓ |
| 9 | C | ✓ |
| 10 | B | ✓ |
| 11 | Short answer — full & correct | ✓ 5/5 |
| 12 | Short answer — full & correct | ✓ 5/5 |
| 13 | Short answer — full & correct | ✓ 5/5 |
| 14 | Short answer — full & correct | ✓ 5/5 |

The 12 points recovered from the first run were all L2-guide content
(setting-tool procedure detail, pumpdown-window reasoning, and the
tool-trap/anti-preset procedures) that was absent from the corpus until the
Level 2 guide was added as a supplemental source.
