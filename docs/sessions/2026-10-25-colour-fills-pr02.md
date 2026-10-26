# Colour fills PR-02: teal fills and edges onto the fill roles (CUL-2178)

**Date:** 2026-10-25
**One thing:** D3 L1 — Reading a test: a test can pin the wrong answer on purpose, so the tempting shortcut turns the build red · check: pending

Dispatched BUILD row, shipped via #1331. The PR body is the record of the change. This file exists because the row carried `Teach: yes`.

What shipped: three colour role leaves as CUL-1279's round ruled (`positive.fillOnLight`, `positive.fillOnTrack`, `action.fill`), each pinned on its ground, and 31 teal fills and edges walked onto them or onto the existing selected and neutral roles. The colour guard's registry fell from 75 to 44. The trial ledger's two cells stay under CUL-1902; the accent button moves with CUL-2200. One site the ruling did not name, the Signal receipts band's dashed end, took `fillOnLight` as a Designer call, logged on the issue.

## Teach

### One thing — A test can pin the wrong answer on purpose (D3, L1)
Most test lines check that something works. Some check that a tempting alternative does not, so nobody can quietly switch to it. Today the teal that reads fine on white turned out too faint inside a grey progress track, so progress bars got a darker teal. A test now records that the lighter teal fails in the track. If someone later "tidies" the progress bars back onto the lighter teal, the build turns red and says why.

**Like:** a note taped inside a fuse box saying "the 10 amp fuse fits this slot but melts; use the 15". The note exists because the wrong fuse fits.

**In today's work:** `constants/theme.contrast.test.ts`
`expect(contrastRatio(theme.colorAccentGlyph, theme.colorChartEmpty)).toBeLessThan(NON_TEXT);`
This asks for the lighter teal's contrast against the grey track and requires it to be under 3:1, the minimum a progress fill needs. The line passes only while that teal is the wrong choice there, which is the point: it documents the trap in a form the build enforces.

**Why it matters to you as PM:** a design ruling like "fill in a track takes the ink" survives only if breaking it costs something; this line is that cost.

**Check:** if a later palette change made the lighter teal dark enough to read in the track, what would this test do, and would that be a bug?
