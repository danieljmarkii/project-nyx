-- ============================================================
-- Migration 092: a photo landing, leaving or moving takes back a stored leave
--   to wait (Engines v3 PR-27j)
-- See: CUL-1682 (the issue, the adversarial reviewer's preferred close on its
--      2026-10-08 comment, the plan and the PM's go);
--      089_may_wait_record_change.sql / 090 (the events-side half, whose shape
--      this mirrors);
--      supabase/functions/_shared/incidentMayWait.ts (photoReadSettled,
--      neighbourRefuses: the predicate lines this answers) and
--      incidentMayWaitEvidence.ts (the photo-set reads behind them).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- `may_wait` TRUE is leave for a call_today read to say "first thing tomorrow".
-- The server grants it only over photos it read: `photoReadSettled` requires the
-- payload's `read_photo_set_key` to equal the event's photo set NOW, for the read
-- itself and for every photographed neighbour (`neighbourRefuses`). But the
-- server checks that only when it writes. A photo that reaches the server with
-- no read after it changes the set and asks nothing:
--   · the retry queue lands it later (lib/sync.ts drainEventAttachmentsQueue),
--     after the edit screen's or the detail screen's own upload failed;
--   · any other writer of event_attachments (a second device, a future path).
-- So a TRUE written over photo set {A} stood beside a photo B nobody read, on
-- the event itself and on every TRUE whose neighbour it is. A photo REMOVED
-- leaves the same mismatch (the key no longer names the set). Here the database
-- lowers it, in the same transaction as the attachment write.
--
-- ------------------------------------------------------------
-- THE DIRECTION IS STILL THE POINT (089's rule)
-- ------------------------------------------------------------
-- The one write is `may_wait = NULL` on a row holding TRUE: the louder line, the
-- lower-only transition 088 opened in the freeze. Nothing here writes TRUE or
-- FALSE, and nothing asks for a read: a lowered row keeps the louder line until
-- the server's next read of it (the edit / detail chain when it lands, the
-- section's mount, or a neighbour's read re-checking it).
--
-- WHY INVOKER (088's and 089's reason): the sweep runs as the writer, so 013's
-- RLS bounds it to rows they could already UPDATE, and the freeze judges it like
-- any client write. EVERY ROLE FIRES: no server path re-checks after an
-- attachment write.
--
-- ------------------------------------------------------------
-- WHAT IS LOWERED
-- ------------------------------------------------------------
-- For each touched event P (NEW's on an insert, OLD's on a delete, both on a
-- move between events or pets):
--   self       P's own TRUE, whatever P's type (photoReadSettled on the read
--              itself: its photo set moved under it). On a vomit or stool the
--              window below already reaches it; the clause is what reaches a
--              TRUE left on an event re-typed away from one (a re-type before
--              089 left it standing).
--   neighbour  every TRUE of the same pet (the attachment's pet or P's, against
--              the analysis row's pet or its event's: CUL-882's both-ways rule)
--              whose anchor sits within 72 h of P's `occurred_at`, when P is a
--              live incident the predicate reads (MAY_WAIT_INCIDENT_TYPES, not
--              soft-deleted): `readMayWaitRecord` reads photo sets only for the
--              live incidents within MAY_WAIT_NEIGHBOUR_HOURS of the anchor (its
--              `near`), and `neighbourRefuses` refuses one holding an unread
--              photo. NOT 090's 2 x 72 h: that answers a different question (a
--              moved vomit changes the floor re-run, which reads twice the reach
--              and reads no photo). Same value today, different question, so the
--              window is derived from `near`, pinned by
--              guards/mayWaitPhotoChange.test.ts (C-34).
-- A photo on any other event type (a meal, a symptom) is not a neighbour the
-- predicate reads, so it lowers only P's own TRUE (none exists: only incidents
-- carry a per-incident read).
--
-- FAILS CLOSED: a touched event that cannot be read (hard-deleted, or outside
-- the writer's RLS) lowers every TRUE on the attachment's pet; a TRUE whose own
-- event cannot be read is lowered for a touch on a live incident of its pet.
--
-- THE DELETION CASCADE (adversarial pass): auth.admin.deleteUser deletes
-- auth.users as supabase_auth_admin, and a cascade's row triggers run as the
-- role that ran the outer DELETE. That role holds no grant on public, so the
-- sweep would raise `permission denied for schema public` and abort the account
-- deletion. On a DELETE only, a writer that cannot UPDATE event_ai_analysis and
-- SELECT events returns before the sweep (privileges read from pg_catalog,
-- schema first, since naming a table in an unusable schema itself raises).
-- Such a writer reaches event_attachments only through a cascade, which takes
-- every row it could lower with it. An insert or move still raises for it.
--
-- WHAT FIRES (two AFTER triggers, row-level, one function; split because a
-- WHEN clause cannot read OLD on an insert or NEW on a delete):
--   INSERT                  a photo lands (the first upload or the retry queue).
--   DELETE                  a photo is removed (lib/attachments.ts; the replace
--                           path deletes the old row and inserts the new one).
--   UPDATE OF event_id, pet_id, only when one of them actually moves. The
--                           client writes attachments with `upsert(…, onConflict:
--                           'id')`, and a retry of an already-landed row is an
--                           ON CONFLICT DO UPDATE naming both columns with the
--                           same values; an unguarded UPDATE OF would lower a
--                           settled TRUE on every such retry.
--
-- No recursion: the sweep moves only `may_wait` on event_ai_analysis, so 088's
-- edit predicate is false for every lowered row, and no events, meals or
-- attachment row is written.
--
-- STATED BLIND SPOTS (filed on CUL-1682):
--   · it gives the photo no read. Restoring the read is the follow-up (the
--     section re-reads on a photo-set mismatch; the drain asks once lib/sync.ts
--     is free);
--   · the read-in-flight race: a read that started over the old set and writes
--     TRUE after this trigger fired carries the old `read_photo_set_key`. The
--     pipeline's own re-check after its write (revalidateMayWait, including
--     self) re-reads the attachment ids and narrows this to the instant the two
--     transactions overlap, or a failed best-effort re-check. Only the
--     reader-side check closes it (CUL-1629 must require `read_photo_set_key`
--     to equal the current set before it renders a TRUE);
--   · a TRUE written before this migration over a photo already changed stays
--     until the server's next read near it (no backfill; no installed build
--     renders a TRUE yet, CUL-1629's).
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     unchanged, and never blocked: under supabase_auth_admin the
--                trigger returns before its sweep (above); under a role with the
--                grants it lowers TRUEs that are about to be deleted.
--   RLS:         unchanged. INVOKER: for a client its reads (events) and its sweep
--                are bounded by the writer's own rows. service_role is unbounded,
--                and the touched event's pet is matched as well as the
--                attachment's: event_attachments has no same-pet guard (003 has
--                no 074-style trigger), so a service-role write on a row a client
--                planted with another account's event id would lower that
--                account's TRUE near it. Lower-only and raises nothing, and no
--                service-role path writes event_attachments today (filed on
--                CUL-1682 with the same-pet guard).
--   Freeze:      unchanged. The sweep uses 088's TRUE -> NULL, nothing else.
--   Storage:     untouched; the trigger reads no path and no object.
--   Realtime:    lowered rows publish as ordinary updates (059); a boolean
--                carries no words, paths or URLs.
--   Errors:      the function raises nothing (C-31).
--   Wipe list:   no local copy yet (PR-27f's).
--   Model reads: none.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one new function, two new triggers; no column, row or data
--                     changed on apply).
--   Rollback (one transaction):
--     BEGIN;
--     DROP TRIGGER trg_event_attachments_may_wait_photo      ON public.event_attachments;
--     DROP TRIGGER trg_event_attachments_may_wait_photo_move ON public.event_attachments;
--     DROP FUNCTION public.take_back_may_wait_on_photo_change();
--     COMMIT;
--     Any TRUE already lowered stays NULL after rollback, which is the louder
--     line; nothing to restore.
--   Backfill:     N/A (see the third blind spot).
--   Affected tables: event_attachments (two triggers), event_ai_analysis (the
--                 sweep's target; 089's partial index on the TRUE set serves it).
--                 Sanity checks before applying:
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_photo_change';  -- 0
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_record_change'; -- 1 (089 applied)
--                   SELECT count(*) FROM public.event_ai_analysis WHERE may_wait IS TRUE;              -- the TRUEs a photo write may lower
-- ============================================================


-- ============================================================
-- §1 A photo landing, leaving or moving takes back the leave to wait
-- ============================================================
CREATE OR REPLACE FUNCTION public.take_back_may_wait_on_photo_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_events uuid[] := '{}';
  v_pets   uuid[] := '{}';
BEGIN
  -- The deletion cascade: auth.admin.deleteUser deletes auth.users as
  -- supabase_auth_admin, and the cascade's row triggers run as that role, which
  -- holds no grant on public. An unguarded sweep would abort every account
  -- deletion with a photo. A writer that cannot reach the analyses can only be
  -- deleting attachments through a cascade, and every row it could lower goes
  -- with them. DELETE only: an insert or move by such a writer still raises.
  IF TG_OP = 'DELETE' THEN
    IF NOT has_schema_privilege('public', 'USAGE') THEN
      RETURN NULL;
    END IF;
    IF NOT has_table_privilege('public.event_ai_analysis', 'UPDATE')
       OR NOT has_table_privilege('public.events', 'SELECT') THEN
      RETURN NULL;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_events := v_events || NEW.event_id;
    v_pets   := v_pets   || NEW.pet_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_events := v_events || OLD.event_id;
    v_pets   := v_pets   || OLD.pet_id;
  END IF;

  UPDATE public.event_ai_analysis a
     SET may_wait = NULL
   WHERE a.may_wait IS TRUE
     AND (a.event_id = ANY (v_events)
       OR EXISTS (
         SELECT 1
           FROM unnest(v_events, v_pets) AS t(event_id, pet)
           LEFT JOIN public.events p ON p.id = t.event_id
           LEFT JOIN public.events n ON n.id = a.event_id
          WHERE (a.pet_id = t.pet OR a.pet_id = p.pet_id
                 OR n.pet_id = t.pet OR n.pet_id = p.pet_id)
            AND (p.id IS NULL
                 OR (p.event_type::text IN ('vomit', 'stool_normal', 'diarrhea')
                     AND p.deleted_at IS NULL
                     AND (n.occurred_at IS NULL
                          OR (n.occurred_at >= p.occurred_at - interval '72 hours'
                              AND n.occurred_at <= p.occurred_at + interval '72 hours'))))));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.take_back_may_wait_on_photo_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_photo_change() FROM anon;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_photo_change() FROM authenticated;

CREATE TRIGGER trg_event_attachments_may_wait_photo
  AFTER INSERT OR DELETE ON public.event_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.take_back_may_wait_on_photo_change();

CREATE TRIGGER trg_event_attachments_may_wait_photo_move
  AFTER UPDATE OF event_id, pet_id ON public.event_attachments
  FOR EACH ROW
  WHEN (OLD.event_id IS DISTINCT FROM NEW.event_id
     OR OLD.pet_id   IS DISTINCT FROM NEW.pet_id)
  EXECUTE FUNCTION public.take_back_may_wait_on_photo_change();

COMMENT ON FUNCTION public.take_back_may_wait_on_photo_change() IS
  'CUL-1682 (092): a photo inserted, deleted or moved on event_attachments lowers may_wait TRUE -> NULL on the touched event''s own TRUE and, when that event is a vomit / stool, on every TRUE of the same pet anchored within 72 h of it (the reader''s neighbour reach, MAY_WAIT_NEIGHBOUR_HOURS): the predicate grants leave only over photos it read (photoReadSettled). An unreadable event lowers every TRUE on the pet. On a DELETE by a writer without the grants (the deleteUser cascade) it returns first. INVOKER, so RLS bounds a client''s sweep; every role fires. Raises no message of its own.';
