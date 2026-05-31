---
name: SSE Pattern
description: How SSE is wired in this project — Orval limitation and frontend workaround.
---

Orval cannot generate typed hooks for `text/event-stream` responses. The SSE endpoint at `GET /api/events` is **not** in the OpenAPI spec.

**Frontend**: subscribe using `new EventSource('/api/events')` directly (no codegen hook).

**Backend**: `lib/sseClients.ts` exports `addSseClient`, `removeSseClient`, `broadcast`. Routes call `broadcast(eventName, payload)` on mutations.

**Why:** Including `text/event-stream` in the spec breaks Orval codegen — it generates invalid TypeScript for streaming responses.

**How to apply:** Any new SSE events just need a `broadcast()` call on the server side. Frontend consumers add a `message` event listener and switch on `data.type`.
