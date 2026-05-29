---
name: supabase-sync
description: Use this skill when touching the local-first sync queue, Supabase Storage uploads, RLS-gated reads, or any new Supabase table that will be synced from device. Triggers include modifying `lib/sync.ts` or `lib/storage.ts`, calling `supabase.from(...).upsert(...)` from a sync path, calling `supabase.storage.from(...).upload(...)` or `.createSignedUrl(...)`, adding a new local SQLite table that mirrors a Supabase one, creating a new attachment / photo / file pipeline, writing a new Supabase migration that defines a multi-pet table or RLS policy, creating a new Supabase Storage bucket, or building any feature that has to survive offline-write → reconnect → flush. Codifies the bug classes that already cost us debug sessions in B-027 — the unchecked-upsert-marks-synced trap, the 0-byte blob from `fetch(uri).blob()`, the SQL-created-bucket RLS landmine — plus the pet-ownership and last-write-wins rules that come from CLAUDE.md.
---

# Supabase Sync — Local-First Patterns

## Origin and Scope

Extracted from `lib/sync.ts`, `lib/storage.ts`, `lib/db.ts`, `supabase/migrations/003_attachments.sql`, plus the Dir. of Eng. anti-patterns in CLAUDE.md. Where the `clinical-guardrails` skill protects against a future regression of a rule we currently hold, this skill protects against a class of bug we have **already lost time to** — most of the B-027 plumbing debug was repeat-application of the patterns below. Every photo/file/sync feature we ship hits this surface.

**Out of scope:** the conflict-resolution semantics (last-write-wins by `updated_at` is decided in CLAUDE.md and not negotiable here), and one-off migrations themselves (covered by the Migration Safety Pre-flight in CLAUDE.md). This skill covers the runtime sync code, the storage layer, and the table-shape preconditions that make them safe.

---

## PATTERN 1: Always Check the Upsert Error Before Marking `synced = 1`

**RULE:** `supabase-js` returns errors rather than throwing. An ignored error silently flags a row `synced` while it's absent server-side — the row only resurfaces when something downstream tries to read it, and you've lost the trail. Every sync writer must check `error` and `continue` (or `return`) on failure, leaving `synced = 0` so the queue retries.

**CANONICAL EXAMPLE** (`lib/sync.ts:225–231` — the trap, with the comment that names it):

```ts
const { error } = await supabase.from('event_attachments').upsert({
  id: att.id, event_id: att.event_id, pet_id: att.pet_id,
  storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
}, { onConflict: 'id' });
// Only mark synced when the row actually landed. Previously the upsert
// error was ignored and synced was set unconditionally — so a failed
// upsert (e.g. the event_attachments table not existing in Supabase) left
// rows flagged "synced" but absent server-side, invisible until something
// read them back. supabase-js returns errors, it does not throw.
if (error) { console.warn('[sync] event_attachment upsert failed:', error.message); continue; }
await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [att.id]);
```

The same fix lives in the vet-attachment loop (`lib/sync.ts:198–202`). When you add a new sync writer (food intake history, conditions, the next attachment table), repeat this exact shape.

**ANTI-PATTERN:** `await supabase.from('x').upsert(...); await db.runAsync('UPDATE x SET synced = 1 ...');` with no error check between the two. Looks fine. Will silently mark rows synced on every failure, until a downstream consumer (Edge Function, signed URL, ai-analysis trigger) reports "not found" on data the user can see locally.

**Companion: the recovery path.** Once a row is wrongly flagged `synced = 1`, the normal queue sweep will never pick it up. `ensureEventAttachmentsSynced(eventId)` (`lib/sync.ts:243–269`) is the canonical recovery shape — force-flush a specific id, ignoring the `synced` flag, with a best-effort upload wrapped in try/catch (the file is usually already in storage). Every new attachment-bearing pipeline should have an equivalent backfill helper if it has a downstream consumer that cares about row presence.

---

## PATTERN 2: Read File Bytes via `expo-file-system`, Never `fetch(localUri).blob()`

**RULE:** In React Native, `fetch(localUri).blob()` returns a 0-byte blob — and `supabase-js` reports a successful upload of that empty blob. Downstream consumers (Edge Functions, signed URL viewers, vision calls) then see an empty file. Read the local file as a `Uint8Array` via `new File(uri).bytes()` from `expo-file-system` and upload **that**.

**CANONICAL EXAMPLE** (`lib/storage.ts:30–50`):

```ts
import { File } from 'expo-file-system';

// In React Native, `fetch(localUri).blob()` returns a 0-byte blob —
// supabase-js then "successfully" uploads an empty object, which the
// extract-food-from-photo Edge Function later rejects as
// `image cannot be empty`. We read the file as a Uint8Array via
// expo-file-system instead, which streams the bytes correctly.
export async function uploadPhoto(
  bucket: string,
  storagePath: string,
  localUri: string,
  mimeType: string = 'image/jpeg',
): Promise<void> {
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw error;
}
```

**ANTI-PATTERN:** `const blob = await (await fetch(localUri)).blob(); await supabase.storage.from(b).upload(path, blob, ...);`. Always use `uploadPhoto()` from `lib/storage.ts` — do not write a new upload primitive inline in a screen.

---

## PATTERN 3: Create Supabase Storage Buckets via the Dashboard UI, Never SQL

**RULE:** A bucket created with `INSERT INTO storage.buckets` has `owner = null`. Even RLS policies on `storage.objects` that look syntactically correct will silently fail (uploads return 42501; reads 400). Buckets must be created via the Supabase dashboard Storage UI (or the JS admin client) so the row is fully initialized — then apply RLS policies via migration.

**CANONICAL REFERENCE:** `Claude/...nyx-pet-photos` is the open item that bit us first (CLAUDE.md Open Questions table). `nyx-food-photos` was resolved the same way (CLAUDE.md Resolved Questions). The pattern: PM creates the bucket via dashboard between sessions; we apply the `*_rls.sql` migration after.

**ANTI-PATTERN:** Putting `INSERT INTO storage.buckets (id, name, public) VALUES ('nyx-foo', 'nyx-foo', false);` in a migration. Will appear to work, will then 42501 on the first authenticated upload, and the policy SQL will look correct in the dashboard. Add a PM Action Item to create the bucket via dashboard UI — block the feature on it rather than working around it.

---

## PATTERN 4: Refresh the Session Before Every Sync Write

**RULE:** A device that's been backgrounded for hours has an expired JWT. `supabase.auth.getSession()` triggers a refresh if the access token has expired and returns `null` if the session is gone. Every sync writer must call it and bail on null — not because the write would crash, but because it would silently 401 with a hostile error message and (combined with Pattern 1) silently flag rows synced.

**CANONICAL EXAMPLE** (`lib/sync.ts:8–9, 101–102, 244–245`):

```ts
// Ensure the JWT is fresh before writing. getSession() triggers a refresh
// if the access token has expired, and returns null if the session is gone.
const { data: { session } } = await supabase.auth.getSession();
if (!session) return;
```

**ANTI-PATTERN:** Trusting the in-memory client to have a fresh token after a long backgrounding. The auth listener does refresh on resume in most cases, but a sync writer that runs *during* the refresh window can race it. Cheap to add the explicit check; expensive when it bites.

**See Ambiguity #1 below — the check is currently missing from `syncPendingVetVisits` and `syncPendingAttachments`.**

---

## PATTERN 5: Last-Write-Wins via `.upsert(payload, { onConflict: 'id' })` Is the Only Write Shape

**RULE:** Every sync writer uses `.upsert(...)`. There is no merge logic, no `if (newer) update` branch, no diff. The server-side row is the device's row at the moment of flush. Conflicts are resolved by `updated_at` on the receiving side. Soft deletes (`deleted_at` set) are part of the upsert payload — `deleted_at` is never a separate DELETE call.

**CANONICAL EXAMPLE** (`lib/sync.ts:125–143`, the events writer):

```ts
const { error } = await supabase.from('events').upsert(
  unsyncedEvents.map((e) => ({
    id: e.id,
    pet_id: e.pet_id,
    event_type: e.event_type,
    occurred_at: e.occurred_at,
    // ... all columns ...
    deleted_at: e.deleted_at,           // soft delete is a column, not a DELETE
    created_at: e.created_at,
    updated_at: e.updated_at,
  })),
  { onConflict: 'id' }
);
```

**ANTI-PATTERN:** Reading the server row first to "see if we should overwrite." Don't. (1) It adds a round-trip per sync. (2) It introduces a race the upsert doesn't have. (3) It's at odds with the CLAUDE.md decision. If you find yourself wanting it, the real question is whether `updated_at` is being stamped correctly on local mutation — fix that instead.

---

## PATTERN 6: Pre-Sync FK Dependencies Before the Dependent Rows

**RULE:** When syncing rows that FK to a table that may exist only locally (e.g. `meals.food_item_id` → `food_items.id` where the food was created on-device), push the dependency table first in the same sync pass, using `{ onConflict: 'id', ignoreDuplicates: true }`. Otherwise the dependent upsert is rejected by the FK constraint and Pattern 1 retries forever.

**CANONICAL EXAMPLE** (`lib/sync.ts:27–66`):

```ts
// Ensure every referenced food item exists in Supabase before syncing meals.
// The local best-effort insert at food-creation time may have failed — this
// guarantees the FK constraint won't reject the meal upsert.
const foodIds = [...new Set(unsyncedMeals.map((m) => m.food_item_id).filter(Boolean))] as string[];
if (foodIds.length > 0) {
  // ... read from local food_items_cache, then:
  await supabase.from('food_items').upsert(
    localFoods.map((f) => ({ id: f.id, /* ... */ created_by_user_id: userId })),
    { onConflict: 'id', ignoreDuplicates: true }
  );
}
```

**ANTI-PATTERN:** Assuming the FK target was successfully synced earlier (at food-creation time, at app-startup cache refresh, etc.). It may not have been — the device was offline, the upsert errored, the user backgrounded mid-flush. Pre-sync dependencies in the same pass that needs them.

---

## PATTERN 7: Every Local Mutation Sets `synced = 0`; Index Accordingly

**RULE:** Any local UPDATE that changes a column the server cares about must set `synced = 0` in the same statement, so the next flush propagates the change. The local SQLite table has a partial index on `synced = 0` so the queue scan is bounded.

**CANONICAL EXAMPLE** (`lib/db.ts:62–64, 251, 276, 328, 346`):

```sql
CREATE INDEX IF NOT EXISTS idx_events_unsynced
  ON events(synced)
  WHERE synced = 0;
```

```ts
// Soft-delete: set deleted_at AND flip synced
'UPDATE events SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?'

// Re-link a meal's food after the user re-picks:
'UPDATE meals SET food_item_id = ?, synced = 0 WHERE event_id = ?'

// Per-event intake rating edit:
'UPDATE meals SET intake_rating = ?, synced = 0 WHERE event_id = ?'
```

**ANTI-PATTERN:** A local mutation that updates a synced column but doesn't reset `synced = 0` — the server permanently disagrees with the device and the user sees stale data on next read-back. Equally bad: setting `synced = 0` without a partial index on the queue table — the sweep scan grows linearly with table size.

---

## PATTERN 8: `pet_id NOT NULL` + Pet-Ownership RLS on Every New Multi-Pet Table

**RULE:** Every Supabase table that holds pet-specific data must have `pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE` plus an RLS policy scoped by `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` — **not** by `user_id` directly. This is the multi-pet readiness rule from CLAUDE.md and the prerequisite that lets every sync writer above stay simple (it never has to filter by user on either end — RLS does it).

**CANONICAL EXAMPLE** (`supabase/migrations/003_attachments.sql:6–25`):

```sql
CREATE TABLE event_attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  -- ...
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_attachments_event ON event_attachments(event_id);

ALTER TABLE event_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_attachments_owner" ON event_attachments
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );
```

The same shape is in `vet_visit_attachments` (lines 28–46) and in `event_ai_analysis` (migration 013).

**ANTI-PATTERN:** RLS policy scoped by `user_id = auth.uid()` directly. Breaks when a second pet is added; breaks when a household-sharing feature comes (Post-MVP backlog). Either way, the multi-pet boundary is `pet_id`, not user.

---

## Ambiguities Flagged

These are gaps between what the skill claims and what the code currently does. They are intentionally left open for PM decision rather than silently "fixed" in this skill.

1. **The session-freshness check (Pattern 4) is inconsistent across sync writers.** `syncPendingMeals` (`lib/sync.ts:8`), `syncPendingEvents` (`:101`), and `ensureEventAttachmentsSynced` (`:244`) all do it. `syncPendingVetVisits` (`:155`) and `syncPendingAttachments` (`:209`) do **not**. The asymmetry is likely accidental (vet-visits and the generic attachment sweep are older code paths). Cheap fix: lift the check into a tiny helper and call it at the top of every writer. Worth a one-line backlog row.

2. **The recovery path (`ensureEventAttachmentsSynced`) exists only for event attachments.** If vet visit attachments ever need the same backfill (and given migration 003 was never applied to the live DB, the symmetric bug class exists), there is no equivalent. Add `ensureVetVisitAttachmentsSynced` when/if it's needed; or generalize into `ensureAttachmentsSyncedForParent(table, parentColumn, parentId)`.

3. **Pattern 1's downstream visibility depends on the table actually existing server-side.** Migration 003 was not applied to the live DB for the `event_attachments` block until the B-027 debug; the rest (`vet_visit_attachments`, `food_items.photo_path`) is *still* not applied per the current PM Action Items in CLAUDE.md. Until applied, vet-visit attachment sync will fail gracefully (Pattern 1 holds, rows stay queued) — but the downstream "attachment row exists" expectation is silently false. Not a code defect; a deployment one. Worth confirming as part of "audit which migrations are actually applied" PM Action Item.

4. **Pattern 6's pre-sync only covers `meals → food_items`.** Other FK chains (`events.pet_id → pets`, `event_attachments.event_id → events`) assume the parent was successfully synced earlier. For pets this is safe (pet is created in onboarding before any event). For events, the `syncPendingAttachments` and `syncPendingMeals` writers run independently of `syncPendingEvents` — so a freshly-logged event whose flush has not yet succeeded could see its child attachment upsert fail FK. Worth confirming whether the call-order in app foreground/reconnect handlers enforces events-then-children, or whether attachments need their own pre-sync of the parent event.
