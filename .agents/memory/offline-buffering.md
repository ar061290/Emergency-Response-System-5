---
name: Offline buffering
description: How sensor/vitals data is queued when the device is offline and synced when connectivity returns.
---

**Frontend**: `lib/offline.ts` stores entries in `localStorage` under `roadsos_offline_buffer`. Each entry is `{id, type, payload, timestamp}`. Types: `sensor`, `vitals`, `pain`, `impact`.

**ChildWatchPage** subscribes to `window.online`/`offline` events. When the device comes back online with buffered entries, `syncBuffer()` is called automatically. The user also sees a manual **Sync** button when `bufferCount > 0`.

**Server**: The sensor schema accepts an optional `offlineBuffered: boolean` flag. If true, the server still processes the data (creates incident / inserts vitals) but the timestamp is the original `payload.timestamp` rather than `now()`.

**Why not IndexedDB / Service Worker?** `localStorage` is sufficient for small JSON payloads (sensor readings are ~200 bytes). If the app scales to high-frequency logging, migrate to IndexedDB.

**How to apply**: Any new sensor endpoint that should support offline must:
1. Accept the `offlineBuffered` flag in the Zod schema
2. Use the original payload timestamp when the flag is present
3. Process the data normally (no special handling needed beyond timestamp)
