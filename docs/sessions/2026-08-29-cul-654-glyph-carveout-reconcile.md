# CUL-654 — the seven glyph nodes return to raw `<Text>`

**Date:** 2026-08-29

Shipped via #747 (draft). One PR, three files, seven sites, no schema.

## What this was

`main` was running two conventions at once for glyph-only `<Text>` nodes. PR 4
(#712, CUL-609) swept them onto `ThemedText`; PR 3 (#713, CUL-608) left them raw
and landed the CLAUDE.md carve-out explaining why. A **race, not a
disagreement** — PR 4 merged before the carve-out existed.

The cost of the swept side is small but real and bought for nothing.
`ThemedText` injects an explicit `fontFamily`, and Geist's cmap carries no
U+2713 / U+2715 / U+FF0B in any of the three loaded weights, so a swept `✓` or
`✕` forces a family lacking the codepoint and hands the render to OS fallback at
a `fontSize` tuned for a different face. Both platforms cascade, so it degrades
rather than tofus — and there is no prose on these nodes to gain the face in
exchange.

Seven sites reverted to raw `<Text>` with the carve-out comment, matching
`app/food-capture.tsx` on #713: `edit-event.tsx:715`;
`medication-capture.tsx:473 / :722 / :730`; `vet-visit.tsx:187 / :202 / :248`.
`Text` was re-added to the `react-native` import in the two files that had lost
it.

## The two calls the issue left to the build session

Both came from the issue's newest comment (Engineer lens,
`2026-08-24-cul-611-geist-periphery-audit`), which supersedes the description
where they differ.

**The two `←` sites are swept for consistency, not coverage.** Geist *does*
carry U+2190, so those cost nothing either way. They go raw because the rule is
stated as *is this copy?* rather than as a codepoint table — deliberately, so
nobody has to re-read a cmap to annotate a chevron. `food-capture.tsx` already
annotates its `←` and `+` identically.

**None of the seven needed the `ValuePreview::vDown` shape.** That precedent — a
raw node spelling `fontFamily` on its own style — exists to bring back a weight
a parent sweep made inert. Checked all seven style blocks: `fontSize` + `color`
only, no `fontWeight` anywhere. No weight to rescue, so a plain raw `<Text>` is
the whole fix. Worth recording as a negative result: the `vDown` shape is for
nested spans that *asked* for a weight, and these are all direct children of a
`TouchableOpacity` or `Animated.View`.

## The guard was proved by mutation, not inspection

`guards/geistRollout.test.ts` is agnostic between the two routes — it asks only
that a family be *declared*, by whichever route — so a green run proves nothing
about whether the new markers are load-bearing. Per CUL-613, it was broken on
purpose: stripping the marker off `vet-visit.tsx`'s `✕` turns it red on that
exact site (`app/vet-visit.tsx:207 — <Text>; use ThemedText, or add a
// geist-ok: <reason>`), and restoring it turns it green.

## What the session found on the way past

**CUL-712 (new, filed not folded).** One full-suite run went red inside the
geist guard's own `readFileSync`, and the identical re-run was green. Rather
than call it a flake, the mechanism was chased down and then reproduced
deterministically: three guards write their detector fixtures *into the
directories the guards scan* (`components/__geist_guard_fixture__.tsx`,
`components/__haptics_guard_fixture__.tsx`,
`app/__completion_card_guard_fixture__.tsx`) and `geistRollout`'s `walk()`
excludes only `node_modules` / `__snapshots__` / `*.test.*`. Under jest's
parallel workers that gives two failure modes — an ENOENT crash when the fixture
dies mid-scan, and the worse one, a *spurious flag* when a foreign guard's
deliberately non-compliant fixture is alive during the scan:

```
+ "components/__haptics_guard_fixture__.tsx:2 — <Text>; use ThemedText, or add a // geist-ok: <reason> above it"
```

That shape is what costs a session later: an intermittent red on `main` naming a
file that no longer exists, pointing at a rule nobody broke — exactly the
pressure CLAUDE.md forbids relieving by weakening the check. Pre-existing,
unrelated to this diff. `guards/edgeFunctionDeploy.test.ts` already has the fix
in-repo (fixtures in `mkdtempSync(os.tmpdir())`, scanner takes a root), which is
why the issue leans that way.

## DoD

- AC — not a build-sequence step; §7 / guard criteria in the PR body, all pass
  except the on-device face check, which is CUL-655's and cannot be done here.
- Anti-patterns — none introduced; this *removes* one (a raw provider face where
  a family was declared).
- `tsc --noEmit` clean. `npx jest --ci` 280 suites / 6116 tests green.
- Tests: N/A — no store, Edge Function or `lib/` utility touched. The relevant
  net is `guards/geistRollout.test.ts`, which already existed and was
  mutation-tested rather than extended. (Engineer signs the exemption.)
- Secrets: none.
- Personas — Designer ✓ (glyph sizing unchanged; the styles were untouched, only
  the wrapper) · Engineer ✓ (cmap parsed from the shipped TTFs, not assumed;
  guard mutation-tested) · Data N/A · Dr. Chen N/A · QA ✓.
- Adversarial review: **N/A** — no clinical or statistical logic. The diff
  changes which font family renders seven non-copy glyphs; it touches no record,
  no threshold, and no owner-facing sentence.
- Future-self — introduces no new pattern; it *converges* two, onto the older
  and documented one. In 12 months the right end state is the B-745 `GlyphSvg`
  migration eating all of these nodes, at which point the carve-out and its
  markers delete themselves.

## Flagged, not written — Tier-2 doc edit needing PM confirmation

`docs/nyx-app-polish-requirements.md` §7 currently reads:

> PR 1 blocks all sweeps; the sweeps are mutually independent (disjoint files —
> parallel-safe across sessions).

That is **wrong for the PR 3 / PR 4 pair**, and this issue is the bill for it: a
capture screen belongs to its tab by filename and to the completion chain by
behaviour, so both sweeps legitimately claimed `app/food-capture.tsx`.

Proposed replacement:

> PR 1 blocks all sweeps. The sweeps are *largely* independent, but not
> disjoint — a capture screen belongs to its tab by filename and to the
> completion chain by behaviour, so PRs 3 and 4 both claimed
> `app/food-capture.tsx`. Where two sweeps overlap, the later one inherits the
> earlier one's conventions rather than re-deciding them; a convention landed
> mid-chain (the glyph carve-out) does not retroactively apply itself to what
> already merged (CUL-654).

The forward-looking value is gone — PRs 5 and 6 have shipped — so this is for
the record and for the next multi-PR sweep that assumes filename disjointness
means file disjointness.

## Next

The only verification a font sweep can really get is **CUL-655**, the on-device
pass. Nothing here is confirmed until a phone renders it.
