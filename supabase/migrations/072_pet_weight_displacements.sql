-- ============================================================
-- Migration 072: pet_weight_displacements — keep the profile weight a write
-- displaces, instead of destroying it (CUL-694; Engines v3 critique CUL-1268
-- BRK-11 / TD-1)
-- ============================================================
--
-- WHAT THIS IS. One new table and one AFTER trigger on `pets`. Whenever
-- `pets.weight_kg` changes away from a non-NULL value, the value it held is
-- written here, with the best-known window for when it was set. Nothing in the
-- app, the Edge Functions, the report, Ask or the widget reads this table, and
-- `guards/weightDisplacements.test.ts` makes that empty reader set an assertion.
-- Its first reader is EN-8 (CUL-1135, the sourced weight history).
--
-- WHY IT EXISTS. `pets.weight_kg` has two writers and both overwrite in place:
--   · every weigh-in re-points it at the latest reading (app/log.tsx
--     handleConfirmWeight; lib/weight.ts updateWeightCheck and the CUL-641
--     delete reconcile; lib/sync.ts reconcilePetWeightSnapshot, the CUL-293 retry);
--   · the owner's Edit profile form writes it directly
--     (components/profile/EditPetModal.tsx).
-- So an account's first logged weigh-in destroys the profile weight it had, and
-- the Undo card's in-memory copy is the only other place it ever lived. That is
-- how Nyx's June 4.4 kg vanished under a 9/16 clinic weigh-in of 3.73 kg, the
-- one number the engines deep dive calls its most important fact. The
-- counterexample BRK-11 names: a March clinic weight of 5.1 kg in the profile,
-- overwritten by a November 4.3 kg sick-visit weigh-in, leaves EN-8 one reading
-- and no 16% loss.
--
-- WHY A SERVER TRIGGER, NOT A CLIENT WRITE (ruled with the PM, 2026-09-26).
--   (1) It covers EVERY writer, including the four above and any added later,
--       without one of them having to remember. Four delete paths each
--       silently missing a side effect is the exact shape CUL-641 was.
--   (2) It protects INSTALLED builds the moment it is applied. A client write
--       would wait for the 1.2.0 cut, and the loss is happening now.
--   (3) `pets` has no local SQLite mirror, so there is no second copy to keep
--       honest: no local table, no sync pass, no LOCAL_WIPE_TABLES entry.
-- The issue's original shape, a `weight_checks.displaced_snapshot_kg` column,
-- covers only the weigh-in writer and was set aside for that reason.
--
-- WHY NOT A weight_checks ROW. A displaced profile weight has no measurement
-- date and no source, and every weight surface (the trend, the report's weight
-- lane, Ask's weightSummary) plots weight_checks. Minting a reading here would
-- put a typed guess on the vet report's line (BRK-11's resolution, verbatim).
--
-- ── WHAT A ROW MEANS, AND WHAT IT DOES NOT ──────────────────────────────────
-- source = 'profile' says where the value was taken FROM: the profile field. It
-- does NOT say an owner typed it. The field also holds copies of weigh-ins (the
-- snapshot re-point) and whatever Undo wrote back, so a row here may duplicate a
-- reading. EN-8 tells them apart at read time by matching the value against the
-- pet's weight_checks rows (soft-deleted ones are kept, so an Undo leftover still
-- matches its own reading). That is deliberately left to the reader: dropping a
-- value here because it matched a reading would lose an owner-typed weight that
-- merely coincides with one, which is failing toward loss, the one direction
-- this table exists to refuse.
--
-- replaced_by_kg is the value that displaced it (NULL when the field was
-- cleared). It is what makes the set-time chain below sound.
--
-- held_since_earliest / held_since_latest is the window in which the displaced
-- value was SET, the best-known date BRK-11 asks for. It is when the value went
-- on file, which is never a measurement date: an owner types a vet weight from
-- months ago at onboarding. Resolved in order:
--   (a) EXACT when this pet's previous displacement row was replaced BY this
--       value: that update set it, so both bounds are its displaced_at.
--   (b) EXACT when the pet row has never been edited (updated_at = created_at):
--       the value was set at creation. (0 of 4 live pets are in this state at
--       apply time, so (c) is the common case for the first row per pet.)
--   (c) Otherwise a WINDOW: no earlier than the later of the pet's creation and
--       its previous displacement, no later than the pet row's last update
--       (OLD.updated_at), because any later write would have stamped it.
-- A NULL → value transition writes no row (there is nothing to keep), which is
-- why (a) checks replaced_by_kg rather than trusting the previous row's date.
--
-- ── THE TRIGGER MAY NEVER REFUSE THE WRITE IT WATCHES ───────────────────────
-- AFTER, not BEFORE: an AFTER row trigger's return value is ignored, so it
-- cannot cancel the owner's write (069's RETURN NULL mutation, which silently
-- disabled every later trigger, is structurally unavailable here). And the
-- insert runs inside an EXCEPTION block: if preservation ever fails, the owner's
-- weigh-in or profile save still lands and the failure is RAISE LOG'd. Losing
-- one preserved value is the lesser harm; refusing a weigh-in's snapshot write
-- or the Edit profile save ("Could not save") is the greater one. For the same
-- reason the table carries no CHECK a computed value could fail.
--
-- The WHEN clause means the function runs only when there is something to keep:
-- the old value is non-NULL and the new one differs. EditPetModal re-sends the
-- unchanged weight on every save (a name edit included), and that writes no row.
--
-- ── RLS / PRIVACY (T&S) ─────────────────────────────────────────────────────
-- Body weight is pet health data, the same class as weight_checks.
--   · Owner SELECT only (`pet_weight_displacements_owner_select`): the owner can
--     read her own pet's rows, which data rights require and EN-8 will use.
--   · NO INSERT, UPDATE or DELETE policy. A client can neither forge a row nor
--     erase one; the only writer is the trigger.
--   · The function is SECURITY DEFINER because the inserting client has no
--     INSERT policy, with search_path pinned to '' and every name schema
--     qualified, and EXECUTE revoked from PUBLIC / anon / authenticated (trigger
--     firing does not check EXECUTE). Registered in lib/functionHardening.test.ts.
--   · C-31 (CUL-867): a DEFINER trigger's error message never carries a value
--     read from another row. This one RAISEs no error at all, and its LOG line
--     names only the pet id the caller's own UPDATE already named. Its one lookup
--     reads this table scoped to OLD.id, a row RLS has already let the caller
--     update, so it reaches no other tenant's data.
--   · Deletion: pet_id REFERENCES pets ON DELETE CASCADE, and delete-account is
--     auth.admin.deleteUser plus the FK cascade (users → pets → here), so account
--     deletion needs no change. Export: there is no export path in the tree, so
--     that claim is vacuous, not verified; B-041 must enumerate this table.
--   · Not reachable from the widget, the `ask` LLM boundary, generate-report or
--     the unshipped share link, because nothing names it (the guard).
--
-- WHY A BIGINT IDENTITY KEY AND NOT A UUID. Every synced table here takes a
-- client-minted UUID because rows are born offline. These rows are born only in
-- this trigger, server side, and never sync, so the key is only ever an order:
-- two displacements in one transaction share now(), and the identity breaks the
-- tie for the chain lookup in (a).
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive: one new table, its index, RLS, one
--                     policy, one function and one AFTER trigger. No existing
--                     column, constraint, index, policy or trigger is altered.
--                     trg_pets_updated_at (BEFORE) is untouched and still fires.
--   Affected tables:  public.pet_weight_displacements (new). public.pets gains a
--                     trigger; its rows are not written. Measured at apply:
--                       SELECT count(*) FROM pets;                          -> 4
--                       SELECT count(*) FROM pets WHERE weight_kg IS NOT NULL; -> 3
--                       SELECT to_regclass('public.pet_weight_displacements'); -> NULL
--   Backfill:         N/A. Nothing has been displaced since apply, and values
--                     displaced before it were destroyed at write time and cannot
--                     be recovered from the database. The current profile values
--                     need no copy: they are still in pets.weight_kg, and the
--                     trigger keeps each one the moment it is displaced.
--   Rollback plan:    reversible:
--                       DROP TRIGGER IF EXISTS trg_pets_preserve_displaced_weight ON public.pets;
--                       DROP FUNCTION IF EXISTS public.preserve_displaced_pet_weight();
--                       DROP TABLE IF EXISTS public.pet_weight_displacements;
--                     Loses only the values preserved since apply; nothing reads
--                     them, so no surface changes.
-- ============================================================

CREATE TABLE public.pet_weight_displacements (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id              UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  weight_kg           NUMERIC(5, 2) NOT NULL,
  replaced_by_kg      NUMERIC(5, 2),
  source              TEXT NOT NULL DEFAULT 'profile',
  held_since_earliest TIMESTAMPTZ NOT NULL,
  held_since_latest   TIMESTAMPTZ NOT NULL,
  displaced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The chain lookup (a) and EN-8's read are both "this pet, newest first".
CREATE INDEX idx_pet_weight_displacements_pet
  ON public.pet_weight_displacements (pet_id, displaced_at DESC, id DESC);

COMMENT ON TABLE public.pet_weight_displacements IS
  'CUL-694 / BRK-11: every non-NULL pets.weight_kg value at the moment a write displaced it, written only by trg_pets_preserve_displaced_weight. source = profile means taken FROM the profile field, not typed by the owner: a row may duplicate a weigh-in copy or an Undo leftover, which the reader (EN-8, CUL-1135) tells apart by matching weight_checks. Never a weight_checks row, never plotted. held_since_* is when the value went on file, not when it was measured. Nothing reads this table yet (guards/weightDisplacements.test.ts).';

ALTER TABLE public.pet_weight_displacements ENABLE ROW LEVEL SECURITY;

-- Belt and braces under RLS. Supabase's default privileges grant ALL on a new
-- public table to anon and authenticated, and ALL includes TRUNCATE, which RLS
-- does not govern. Clients keep SELECT (the owner's read) and nothing else.
REVOKE ALL ON TABLE public.pet_weight_displacements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.pet_weight_displacements FROM authenticated;

-- SELECT only. The absence of an INSERT / UPDATE / DELETE policy is the point:
-- the trigger is the only writer and nothing a client sends can add or erase a row.
CREATE POLICY "pet_weight_displacements_owner_select" ON public.pet_weight_displacements
  FOR SELECT TO authenticated USING (
    pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.preserve_displaced_pet_weight()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prev_displaced_at TIMESTAMPTZ;
  prev_replaced_by  NUMERIC(5, 2);
  since_earliest    TIMESTAMPTZ;
  since_latest      TIMESTAMPTZ;
BEGIN
  BEGIN
    SELECT d.displaced_at, d.replaced_by_kg
      INTO prev_displaced_at, prev_replaced_by
      FROM public.pet_weight_displacements d
     WHERE d.pet_id = OLD.id
     ORDER BY d.displaced_at DESC, d.id DESC
     LIMIT 1;

    IF prev_displaced_at IS NOT NULL AND prev_replaced_by = OLD.weight_kg THEN
      -- (a) the previous displacement set this value.
      since_earliest := prev_displaced_at;
      since_latest   := prev_displaced_at;
    ELSIF OLD.updated_at = OLD.created_at THEN
      -- (b) never edited: set at creation.
      since_earliest := OLD.created_at;
      since_latest   := OLD.created_at;
    ELSE
      -- (c) a window. LEAST keeps the bounds ordered even if a clock ever put
      -- updated_at behind a previous displacement, so no bound can invert.
      since_latest   := OLD.updated_at;
      since_earliest := LEAST(GREATEST(OLD.created_at, prev_displaced_at), since_latest);
    END IF;

    INSERT INTO public.pet_weight_displacements
      (pet_id, weight_kg, replaced_by_kg, held_since_earliest, held_since_latest)
    VALUES
      (OLD.id, OLD.weight_kg, NEW.weight_kg, since_earliest, since_latest);
  EXCEPTION WHEN OTHERS THEN
    -- Never refuse the write this trigger watches (header). SQLSTATE only: no
    -- value from any row reaches the message.
    RAISE LOG 'preserve_displaced_pet_weight: preservation failed for pet % (SQLSTATE %)', OLD.id, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_displaced_pet_weight() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preserve_displaced_pet_weight() FROM anon;
REVOKE ALL ON FUNCTION public.preserve_displaced_pet_weight() FROM authenticated;

COMMENT ON FUNCTION public.preserve_displaced_pet_weight() IS
  'CUL-694 / BRK-11: AFTER UPDATE OF weight_kg on pets, keeps the displaced non-NULL value in pet_weight_displacements with the window in which it was set. AFTER so it can never cancel the write; the insert is wrapped so a preservation failure is RAISE LOG''d and the owner''s write still lands. SECURITY DEFINER because clients hold no INSERT policy on the table; search_path pinned to '''', EXECUTE revoked from PUBLIC/anon/authenticated. Raises no error; its one lookup reads the table scoped to OLD.id (C-31).';

CREATE TRIGGER trg_pets_preserve_displaced_weight
  AFTER UPDATE OF weight_kg ON public.pets
  FOR EACH ROW
  WHEN (OLD.weight_kg IS NOT NULL AND OLD.weight_kg IS DISTINCT FROM NEW.weight_kg)
  EXECUTE FUNCTION public.preserve_displaced_pet_weight();
