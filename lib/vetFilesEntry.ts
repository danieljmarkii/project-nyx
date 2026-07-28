// Whether the Vet Files entry point renders on the pet profile (B-478).
//
// VF-2 built the read surfaces — the library list, its empty state, the profile
// Records cards and the signed-URL read path — but capture was VF-3 and the document
// detail is VF-4. Between those merges the feature was real code with two holes in
// it, and a "Vet Files" card on the profile would have handed an owner a screen whose
// add button led nowhere. The alternatives were both worse: shipping a live button
// that does nothing, or shipping placeholder copy ("coming soon") that VF-6's voice
// pass would delete anyway.
//
// So the surfaces shipped complete and unreachable, and this flipped to `true` in
// VF-3 — a one-line change, and the last line of that PR.
//
// FLIPPED 2026-07-27 (VF-3). Capture exists: the add sheet, the instant save with
// defaults, the saved moment, multi-page grouping and D13's copy-to-another-pet all
// work, so the card's add button now leads somewhere real.
//
// NO HOLES REMAIN as of VF-4 (2026-07-27): the document detail screen shipped, so a
// library row opens, views, edits, shares and soft-deletes. This note previously said
// tapping a row "still does nothing" and pointed at a `pendingScreen` helper that no
// longer exists — corrected in VF-6, which is the pass that is supposed to catch a
// header asserting the opposite of what shipped.
//
// This is a build-time constant on purpose, not an `app_config` flag: a flag would
// need its own migration (schema-isolation rule) and a runtime fetch to answer a
// question that is settled at compile time by which PRs have merged.
export const VET_FILES_ENTRY_ENABLED = true;
