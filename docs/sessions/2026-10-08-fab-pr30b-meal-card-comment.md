# FAB PR-30b: the meal card's comment stops promising a server reader

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1675, shipped via #1119. Comment only.

The `savePicker` comment in `components/ui/MealCompletionCard.tsx` said `occurred_at_source` is how the vet report and the correlation engine tell a witnessed-now log from an owner backfill. A grep of `supabase/functions/` finds no reader (C-38). It now carries the wording #1118 left in `components/log/SimpleEventConfirm.tsx` and `app/log.tsx`: stored truth, no server lane reads it yet, CUL-1638 kept `now` meals eligible. The surrounding argument (provenance moves only when the time moves, CUL-701) is unchanged.

No behaviour change, nothing in an Edge Function's closure, nothing redeploys. tests: N/A — comment only; `tsc --noEmit` clean, `MealCompletionCard.test.tsx` and the pre-push guard set green.

Residual: none.
