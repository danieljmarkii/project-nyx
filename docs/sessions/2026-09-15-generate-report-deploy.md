# The vet report catches up — `generate-report` v15, and the CUL-19 hold clears

**Date:** 2026-09-15

Shipped via #850.

## How this started

Not from the backlog. The PM opened his own vet report ahead of a real appointment for Nyx the next day, noticed there was no cough on it, and asked why.

There was a good answer, and it was worse than a missing feature.

## What was actually wrong

`generate-report` was live at **v14, deployed 2026-07-30**, while `main` carried roughly six weeks beyond it. `cough` and `sneeze` joined `REPORT_SYMPTOM_TYPES` on 2026-08-28 (CUL-676, #732) and had therefore **never once executed in production**.

The engine had no such gap. `generate-signal` was current at v34, and at the moment the PM was looking at that report it was carrying, at **rank 1, tier `firm`**:

> "We've logged coughing for Nyx across 6 of the last 8 weeks — 21 episodes since August. A symptom that keeps recurring over weeks is worth booking a vet visit."

and, on the lead card, the §9 adjacency caveat:

> "Coughing is logged too — a cough can look like retching or end in vomiting. Mention both."

Measured on the record: 28 cough rows and 12 sneeze rows, 2026-07-01 → 2026-09-14. Against the **cat** chronicity floors (4 episodes / 21-day span / 3 active weeks) it sat at 21 episodes, 43-day span, 8 active weeks, last episode one day prior. Not marginal on any axis.

So the app was telling an owner, in its strongest available register, to book a visit about a lingering cough — while the artifact whose entire purpose is to carry that finding to a vet stayed silent on it, and showed the chronic **vomiting** flag alone, without the caveat that in cats those two get confused in both directions. The report understated the picture on precisely the axis the caveat exists to protect.

That is the part worth remembering. The stale deploy was the mechanism. The defect was that two surfaces reading the same `detection.ts` could disagree about a firm-tier safety finding for six weeks with nothing in the repo failing.

## The ruling

CUL-965 — filed the day before, Urgent, `Waiting on PM` — was already exactly this question: CUL-557 names `generate-report` in the pre-cut deploy order, the ledger holds it, both cannot be true. The PM ruled **option (a)**: deploy now, the refusal lane becomes post-deploy work.

What that accepts, stated plainly rather than buried: the refusal band went live carrying **CUL-60**'s two known floor mismatches. Too loose at the bottom (fires on 3 rated feedings out of an arbitrarily large unrated population) and too slow at the top (`UNHYDRATED_SET_FLOOR = 10` leaves a cat fed once a day and refusing every bowl silent for nine days, past the 48–72h window the flag's own copy cites). Those floors were derived to gate a claim, where silence was cheap. They now drive an above-the-fold clinical escalation nobody re-derived them for.

Bounded on this particular record, which is why the ruling was defensible the day before an appointment rather than reckless: Nyx has 0 looks, 0 `check_in` rows, 0 `vet_visits`, so CUL-891's denominator defect, the Noticed block and the `vet_visits.deleted_at` reader were all inert; and that day's signal carried no `intake_decline` finding, so the refusal lane was not firing for this pet at all.

## Two corrections to CUL-965's own framing

Both recorded on the issue:

- **Option (c) — "split the hold" — is close to moot, not merely unevaluated.** The hold's rationale is about one lane, but the fingerprint is computed over the whole shipping closure, so there is no render-layer seam to split on without building one first.
- **CUL-891's defect is *fixed* by this deploy, not merely unblocked by it.** §5.6 filters the look's own `check_in` parent out of the report's countable events, which is the half that was inflating the type-agnostic denominators (measured elsewhere as "days with a log" 3 → 31).

## The deploy

A hard constraint surfaced first and is worth writing down, because it will recur: **a cloud agent session cannot deploy this function.** `SUPABASE_ACCESS_TOKEN` is not in that environment, and the bundle is 490 KB — far past the ceiling where the inline MCP fallback is safe, since the agent would have to reproduce half a megabyte byte-for-byte as a tool parameter. The session built and verified the bundle, and the PM ran the single upload command from the Codespace.

One snag on the way: `git pull --ff-only` raced the SessionStart hook's fetch and died on `error: fetching ref refs/remotes/origin/main failed: incorrect old value provided`, having printed "up to date" from the *stale* ref before the fetch landed. Harmless, but it left local `main` four commits behind while looking current — so the gate before deploying was `git rev-parse HEAD` matching `f2ddf07e`, not the pull's own output. That error is **not** in `docs/git-first-aid.md`, which CLAUDE.md points at by literal error message; filed as CUL-971.

Deployed **v15** from `main` @ `f2ddf07e`. 550 deno tests green, bundle 501992 bytes / 10214 lines, sha256 `66129e68fcc579de3854267874fae862cc033d6380f83c0dd3bfc8fe9303db3d`.

Verified: 14 → 15 and `ACTIVE`, `verify_jwt` preserved `true`, JWT'd boot smoke test returning `{"error":"Pet not found"}` HTTP 404 (booted and ran the pipeline, not a `WORKER_ERROR`), unauthenticated call 401.

**Not verified, and the ledger entry says so rather than implying otherwise:** the byte-level read-back. The deployed source is 490 KB and will not fit back through a session context. Fidelity rests on the script shipping the exact bytes it verified plus identical byte and line counts on both machines from one commit. That is weaker than the runbook's strongest check, and the honest mitigation is a functional end-to-end read rather than a sha nobody looked at.

## The ledger entry, and what was deliberately removed

`deploy-manifest.json`'s `generate-report` entry moves `hold` → `deployed`. The fingerprint was already correct and did not move.

The `reason` field went from **47,440 characters to 3,221**. The 47 KB was six weeks of accumulated "B-494 HOLD UNCHANGED — this re-acknowledgment must not be read as progress toward clearing it" layers. Git keeps all of it. It came out because a cleared hold's do-not-deploy prose sitting inside a `deployed` entry does not read as history to the next person — it reads as an instruction.

What replaced it names three things on purpose: what the deploy released (the thirteen riders), what shipped **knowingly unfinished** (CUL-50 / CUL-59 / CUL-60, with CUL-60's two numbers recorded as *known-wrong rather than settled*), and what was **not** checked (the read-back).

## The real residual

Everything above is catch-up. The only part that prevents recurrence is unbuilt: **nothing in the repo would have caught this.** The engine and the report share `detection.ts`; what they do not share is any check that the *deployed* report can render every symptom the *deployed* engine can flag. CUL-69 added a narrow version (`LANE_SYMPTOM_TYPES.chronicity ⊆ REPORT_SYMPTOM_TYPES`) but it tests `main` against `main`, and this entire defect lived in the gap between `main` and production. Scoped, not built, as CUL-969 part 5 — it may need to be a ledger-aware guard rather than a source-only one.

The other residual is the **`vet-report-cold-read`**, still owed. It needs a rendered artifact and cannot run on code, and this deploy landed six weeks of render change at once across the chronicity flag's lead safety line, the entries-vs-episodes relabel, the onset date and span split, and a new Noticed block. It gates the 1.2.0 cut (CUL-559), not the appointment.

## Docs kept honest

- `STATUS.md`: "Two standing holds" → "One standing hold"; the `generate-report` bullet removed and its clearing recorded beside the previously-cleared `generate-signal` hold, following that entry's existing shape. CUL-891's clause updated — its gate is no longer pending, and widening `daily_look` past the device-pass cohort is now a PM call rather than a blocked one.
- `CLAUDE.md`: the § Status at-a-glance two-holds line updated, and **six now-false CUL-19 / B-494 references trimmed** across the diet-trial, trial-protein, med-history, daily-look and vet-visits rows plus the med-history Open Question. Net −228 B against `main`, and `CEILING_BYTES` lowered to 136,728 in the same PR per the CUL-920 ratchet's second half — the trim is not left as headroom for the next few sessions to grow back into.
