// components/designV2/ — the ONE namespace the Design v2 rendering lives in
// (Design v2 — the whole day, D2-0 / CUL-1062; CLAUDE.md C-36).
//
// Every node the `design_v2` flag draws goes in this directory, so that stubbing
// this one directory is the same thing as "the redesign does not exist". That is
// the premise guards/designV2FlagOff.test.tsx rests on: it renders Home and
// Patterns twice — once as they stand with the flag off, once with every module
// in here answering as absent — and requires the two trees to be equal. A screen
// may hold the gate (`useDesignV2()`), but it delegates the drawing here; UI
// written inline in a screen is invisible to that guard, and the guard's
// per-consumer rule reds a file that reads the hook without importing from here.
//
// Empty at D2-0 on purpose. The first lane to land a surface (D2-3, the Signal
// card + route) adds its modules and deletes the guard's zero-consumer tripwire.
// Helpers do not belong here — a non-component export would be wrapped into a
// component by the guard's switch; a predicate goes in `lib/`.
export {};
