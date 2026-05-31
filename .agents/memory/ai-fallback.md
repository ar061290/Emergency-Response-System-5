---
name: AI fallback without OpenAI
description: Deterministic algorithms that replace OpenAI calls when the API key is unavailable or invalid.
---

`openai.ts` returns `null` when `OPENAI_API_KEY` is missing or starts with `sk-placeholder`. All AI routes check `if (!openai) { return fallback; }` before calling the API.

### Hospital recommendation fallback
`ai_triage.ts` computes a deterministic score per hospital:
- Level I Trauma = +40, Level II = +30, Children's = +25, Other = +10
- Pediatric team = +20, Trauma surgery = +15, CT scan = +10
- Trauma beds *1, ICU beds *0.5, Rating *3
- Distance km * -2, ETA minutes * -1

Hospitals are ranked by score descending. Confidence scores decay by rank.

### Severity classification fallback
`impactMagnitude > 12` → critical, `> 7` → moderate, else minor.

### Voice chat fallback
Randomized from 5 pre-written reassuring replies so the child gets variety even without AI.

**Why:** OpenAI API keys are easy to misplace or expire in development. The app must never 500 because of a missing key.

**How to apply:** Any new AI route must build a `fallback` object before attempting the OpenAI call, and return it immediately if `openai` is null or the call fails.
