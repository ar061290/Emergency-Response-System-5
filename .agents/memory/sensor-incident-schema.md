---
name: Sensor→Incident field names
description: Correct field names when inserting into incidentsTable from sensor pipeline.
---

Common mistakes when building auto-incident creation from sensor data:

- Use `locationAddress` (not `locationName`) — that column does not exist
- Use `ambulanceUnit` (not `ambulanceName`) — that column does not exist
- `parentName` and `parentPhone` are `notNull()` — **must** be provided or insert fails with TS2769

**Why:** The schema evolved with specific naming conventions; quick-written sensor code tends to guess wrong names causing a TS2769 overload error.

**How to apply:** Always check `lib/db/src/schema/incidents.ts` before writing an insert for incidentsTable, especially for optional-looking fields that are actually `notNull()`.
