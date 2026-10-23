# CUL-629 — "something new" has no carrier: verifying the decision brief before the ruling

**Date:** 2026-08-30
**Mode:** DISCOVERY (no code; the deliverable is this record + the outcome comment on CUL-629)

CUL-629 has sat on `Waiting on PM` since 2026-08-23 carrying a three-option decision brief.
Its newest comment (2026-08-29, PO lens) defers the ruling to CUL-695's D1/D2 — and CUL-695
is itself still `Todo` / `Waiting on PM` with D1–D5 unruled. So nothing here was buildable,
and the useful work was to **check the brief's premises against the tree before the PM rules
from it**, per the CUL-671 habit (*when a spec leans on an existing surface, verify the
surface does the thing at file:line*).

Three of the brief's load-bearing claims did not survive the check. None of them changes what
the issue is *about* — the gap is real and reproduces exactly as described — but all three
change what the options cost, and two of them invert the recommendation.

## The gap itself: confirmed

- The arrival moment fires **once per pet, ever** — `lib/signalArrival.ts`, and its header
  argues the "ever" as the feature. *(One stale detail in the issue: the marker is not
  `signal_arrival_played:<petId>`; it is one key, `nyx.signalArrival`, holding
  `{[petId]: true}`. The module explains the choice — a per-pet prefix makes the sign-out
  wipe a `getAllKeys()` scan, and a wipe that scans is a wipe that can miss. Behaviour is
  identical; only the issue's description of the shape is out of date.)*
- The `New` chip fires only for `isNewWorsening` — `components/home/InsightCard.tsx:94`,
  predicate at `lib/signalCopy.ts:581`.
- The live rail marks the card live, not changed (`components/home/SignalZone.tsx:536`).

## Finding 1 — option (b) is mis-costed: there is no prior finding set anywhere

The brief scopes (b) as *"a card-level 'first seen today' line — client-derivable from the
cached finding set, no server change — cheapest."* It is not client-derivable, because
nothing retains a prior set on either side:

| | |
|---|---|
| `supabase/functions/generate-signal/index.ts:1052` | **delete-then-insert per pet** every regen — the server destroys the prior set |
| `lib/signal.ts:560` | `readSignalCache` is a **network read** of `ai_signals`; there is no local persistence of the finding set |
| `lib/signal.ts:479` | `CachedFinding` is `{rank, text, finding}` — **no stable per-finding identity** to key a ledger on |
| `supabase/migrations/005_ai_signals.sql:15` | `generated_at` resets on every 24h regen — it dates the *regeneration*, not the finding |

So (b) needs a **new persisted per-finding ledger** — the same primitive as (a). It is not
"no server change vs. a server change"; it is the same primitive, differing only in *where
the ledger lives*. That is exactly the fingerprint CUL-695's F3/rung-2 already specifies.

## Finding 2 — the primitive existed, was deleted, and restoring it would be wrong

`SignalZone.tsx:533` says a "mark the Signal seen" write once existed and went with the
pulse. It did: `signalFindingsSignature` + `hasUnseenFinding` (`lib/signalCopy.ts`) and
`store/signalMarkStore.ts`, deleted whole in CUL-600 (`30981272`, PR #709) because the
CulpritMark's `live` pulse was their only reader.

Recovering it is a `git revert` away, and it would **not** have solved CUL-629 even if it had
been kept:

1. **It was in-memory only.** The store's own comment: *"the pulse is a session-scoped
   'something's new' nudge, not a durable read receipt, so it's fine … to reset on app
   restart."* CUL-629's scenario is the owner opening the app the next morning — i.e. after a
   restart, with the store empty. `hasUnseenFinding` then returns `true` for **every** finding
   on **every** cold start. As a per-card claim it fails open: it says "new" about everything,
   daily. That is the habituation cost CUL-695 names, manufactured rather than fixed.
2. **It is keyed on `rank:type`.** So it is blind to a *materially changed* finding of the
   same type at the same rank (the chronicity card whose span moved 6 → 9 weeks), and it
   fires spuriously on a pure re-rank of two unchanged findings. It answers "is this ranked
   type-list different?", which is a proxy for novelty, not novelty.

Fit for a pulse, which could be wrong cheaply. Not fit for a sentence on a card. The
CUL-613 shape: a primitive that looks green outside the tree it was written for.

## Finding 3 — (b)'s carrier collides with the ratified spec, and "first seen" is a different claim

- **S1** (`docs/nyx-signal-home-requirements.md` §2) lets a safety card face carry text, rail,
  sample line, and **at most one meta-row chip — the `New` tag**, which §3.2 carves
  explicitly as *a text novelty tag, not the evidence graphic S1 bars*. A card-level
  **line** is not that carve. So (b)'s carrier is unavailable on exactly the class the issue
  most cares about — a new *safety* finding.
- **§3.2 vetoes** change framing on `incident_red_flag` outright (n of 1–3 photos).
- **"First seen" dates when the app noticed, not when the pattern began.** On
  `symptom_chronicity` — whose sentence already carries span and recency — a "first seen
  today" line puts two dates on one card that disagree, and a reader resolves toward the
  newer. That is the CUL-69 class (re-anchoring a claim to a display-derived date). And a
  ledger that starts empty at install marks **every** card "first seen today" on day one,
  for an owner with months of record.

## Finding 4 — option (a)'s stated blocker is stale

The brief says (a) *"needs `generate-signal` prior-set memory, so it rides the CUL-557
redeploy chain."* It does not: `supabase/functions/deploy-manifest.json` has
`generate-signal` at `status: deployed`, `updated: 2026-08-29`, and CUL-557's set is
`analyze-vomit` / `analyze-stool` / `ask` (STATUS.md § Two standing holds, which also records
the `generate-signal` hold as cleared 2026-08-29). So (a) is not deploy-blocked.

## The rule underneath all of it

The `New` chip is affordable today for exactly one reason: `SymptomWorseningFinding` carries
its **own prior-window count** (`priorCount`, `lib/signal.ts:193`), so the novelty is a
property of the current payload, not a diff against a previous one.
`PostprandialTimingFinding` (`:235`) carries **no** prior-window field at all — every number
on it is current-window. That is the real line between §3.2's v1 and v2 rows, and it is
worth stating as a rule: **a finding type can wear `New` for free iff its payload already
carries its own prior-window comparison; every other type needs the ledger.**

## Recommendation put to the PM

Do not rule CUL-629 separately — **fold it into CUL-695's D2 as a consequence of that
ruling**. Both (a) and (b) reduce to one primitive, CUL-695's F3 rung-2 already specifies
that primitive correctly (per-finding *material-change* fingerprint, auto-unfold on move),
and ruling this issue on its own buys a second, weaker ledger that rung 2 then replaces.

If the PM wants something before the store cut, the in-contract option is a **narrowed (a)**,
not (b): server-side prior-set memory extending the `New` **chip** to the two types §3.2
already schedules for it. A chip is S1-safe where a line is not, it needs no new client
register, and it is no longer deploy-blocked.

Option (c) remains available and is cheap to state — but it should be ruled knowing the
carrier it forecloses is a chip the spec has already scheduled, not a new invention.

## Outcome

No code. No PR beyond this record. CUL-629 stays open and stays on `Waiting on PM`; the
brief's premises are now corrected on the issue so the ruling is made against the tree as it
actually is.
