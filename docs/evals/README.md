# Certification Exam Evaluations

Authentic evaluations of the RP Field Tech Assistant against the internal
Level 1–3 certification exams. Each run reproduces the deployed configuration
exactly (`claude-sonnet-5`, live `system-prompt.ts` + `knowledge.ts`, thinking
disabled, `max_tokens` 1024), asks one question per API call, and grades the
answer against the exam's own answer key. **The assistant is never shown the
answer key** — it answers only from its system prompt and knowledge base.

| Level | First run | Final | Fix that closed the gap |
|---|---|---|---|
| [L1](L1_RP-EXAM-L1-001.md) | 30/59 | **45/45** on all answerable (Part D is photo-ID, out of scope) | Added L1 training guide |
| [L2](L2_RP-EXAM-L2-001.md) | 28/40 | **40/40** | Added L2 training guide |
| [L3](L3_RP-EXAM-L3-001.md) | 20/40 | **40/40** | Added L3 training guide + ENG-TB content |

Each gap was closed by adding the corresponding training guide as a
supplemental source (`scripts/supplemental/`) and regenerating `knowledge.ts` —
never by feeding the assistant the exam or its answer key.
