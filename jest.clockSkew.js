// The wall clock, moved forward (CUL-832). Loaded only by jest.clockSkew.config.js,
// which the scheduled `Clock skew` workflow runs; the required CI jobs never load it.
//
// A calendar time bomb is a fixture pinned to a DATE, judged against a real-clock
// window: it passes every day until the calendar crosses the window, then blocks every
// push on a date rather than on a change (CUL-831). This shifts the three ways code
// reads "now" (Date.now(), a zero-argument new Date(), and a bare Date() call, which
// returns a string) and nothing else, so a fixture's literal dates stay where they were
// written while the clock the code judges them against moves on. A suite that pins its
// own clock with jest's fake timers is unaffected: the fake Date replaces this one and
// takes its time from setSystemTime.
//
// A Proxy over the real Date, not a subclass: a class can never be called without
// `new`, so a subclass turned every bare Date() into a TypeError, a red that would read
// as a time bomb. What it cannot move, stated so it does not read as coverage (C-38): a
// Date the engine builds itself (structuredClone) is the real one, and an instance's
// `.constructor` is the real Date rather than this global.
//
// CLOCK_SKEW_DAYS is required, with no default: guards/clockSkew.test.ts reads the same
// variable to prove the clock really moved, so the two can never silently disagree.
const raw = process.env.CLOCK_SKEW_DAYS;
const days = Number(raw);
if (raw === undefined || raw.trim() === '' || !Number.isInteger(days)) {
  throw new Error(`jest.clockSkew.js needs CLOCK_SKEW_DAYS set to a whole number of days, got "${raw}"`);
}
const SKEW_MS = days * 86_400_000;
const RealDate = Date;
const realNow = RealDate.now;
const skewedNow = () => realNow.call(RealDate) + SKEW_MS;

// Date.now is replaced as a plain writable property, never answered from a Proxy trap:
// jest.spyOn(Date, 'now') assigns the property and reads it back, and a trap that
// always answered would hide the spy (and the suite's later mockRestore would never run).
RealDate.now = skewedNow;

globalThis.Date = new Proxy(RealDate, {
  // `new Date()` reads the skewed clock, never Date.now, which a test may have mocked
  // (the real constructor ignores Date.now too). An explicit instant passes through
  // untouched, and newTarget is forwarded so a subclass still constructs its own.
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length === 0 ? [skewedNow()] : args, newTarget);
  },
  // A bare `Date()` ignores its arguments and returns the current time as a string.
  apply(target) {
    return new target(skewedNow()).toString();
  },
});
