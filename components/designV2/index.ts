// components/designV2/ — the ONE namespace the Design v2 rendering lives in
// (Design v2 — the whole day, D2-0 / CUL-1062; CLAUDE.md C-36).
//
// Every node the `design_v2` flag draws goes in this directory, so that stubbing
// this one directory is the same thing as "the redesign does not exist". That is
// the premise guards/designV2FlagOff.test.tsx rests on: it renders Home, Patterns
// and the Signal route twice — once as they stand with the flag off, once with
// every module in here answering as absent — and requires the two trees to be
// equal. A screen may hold the gate (`useDesignV2()`), but it delegates the drawing
// here; UI written inline in a screen is invisible to that guard, and the guard's
// per-consumer rule reds a file that reads the hook without importing from here.
//
// The first surface landed with D2-4 (CUL-1066): `home/` holds Today's card — the
// look header, the spine, its nodes — and the coverage door. A screen imports the
// module it draws (`components/designV2/home/TodayCard`), never this index, so the
// guard's switch wraps the module the screen actually reaches.
//
// D2-3 (CUL-1065) added `signal/`: the Signal card on Home and the Signal's own screen.
// `SignalZone` and `app/signal/[id]` import the modules they draw; these re-exports are
// the namespace's table of contents.
//
// D2-7 (CUL-1068) added `waits/`: the tick — the one loop behind the flag — and the
// silhouettes the cold start, the report and the event screen show. Their hosts
// import the modules they draw; this file exports nothing, and a helper belongs in
// `lib/` — a non-component export would be wrapped into a component by the guard's
// switch.
export {};
