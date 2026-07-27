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
// work, so the card's add button now leads somewhere real. ONE HOLE REMAINS AND IT IS
// DELIBERATE — the document DETAIL screen is VF-4, so tapping a library row still
// does nothing (see `pendingScreen` in app/vet-files.tsx). That is narrower than the
// gap this flag existed to hide (an owner can add, see, name and type a document; the
// only unbuilt path is viewing one full-screen), but it IS a gap, and it is named in
// VF-3's QA script rather than left for the PM to find.
//
// This is a build-time constant on purpose, not an `app_config` flag: a flag would
// need its own migration (schema-isolation rule) and a runtime fetch to answer a
// question that is settled at compile time by which PRs have merged.
export const VET_FILES_ENTRY_ENABLED = true;
