// How the record screen (`app/event/[id].tsx`) is pushed (History v2 §3.10, §4 "Open a
// record"; HV-10 / CUL-1167): the platform's own push, and no animation under Reduce Motion.
//
// The native stack slides a push whatever the OS setting, so the route has to say it (the
// Signal route's `animation: reducedMotion ? 'none' : …` is the precedent). Declared once,
// where the root stack declares the route, so every door into a record (Home's spine, both
// Histories, the month, a deep link) opens it the same way. The pop takes the push's
// animation, so Back is still under Reduce Motion too.
//
// VoiceOver needs nothing here: a push moves focus to the new screen's first element, which
// is the header's Back button (§4: "the record's back button"); the screen's own suite pins
// that Back comes first.

export interface RecordRouteOptions {
  animation: 'default' | 'none';
}

export function recordRouteOptions(reducedMotion: boolean): RecordRouteOptions {
  return { animation: reducedMotion ? 'none' : 'default' };
}
