// Whether the Vet Files entry point renders on the pet profile (B-478).
//
// VF-2 builds the read surfaces — the library list, its empty state, the profile
// Records cards and the signed-URL read path — but capture is VF-3 and the document
// detail is VF-4. Between those merges the feature is real code with two holes in
// it, and a "Vet Files" card on the profile would hand an owner a screen whose add
// button leads nowhere. The alternatives were both worse: shipping a live button
// that does nothing, or shipping placeholder copy ("coming soon") that VF-6's voice
// pass would delete anyway.
//
// So the surfaces ship complete and unreachable, and this flips to `true` in VF-3 —
// it is a one-line change, and it is the last line of that PR. Until then the
// library is reachable by direct route (`/vet-files`) for QA, which is how the
// populated states get exercised before capture exists.
//
// This is a build-time constant on purpose, not an `app_config` flag: a flag would
// need its own migration (schema-isolation rule) and a runtime fetch to answer a
// question that is settled at compile time by which PRs have merged.
export const VET_FILES_ENTRY_ENABLED = false;
