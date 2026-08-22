import {
  collapseToEpisodeOnsets,
  countEpisodesInWindow,
  SYMPTOM_EPISODE_GAP_HOURS,
} from './symptomEpisodes';

const H = 60 * 60 * 1000;
// Built from LOCAL components deliberately (B-514): nothing here asks a local-day
// question, but a UTC literal in a fixture is the habit that breaks the ones that do.
const T0 = new Date(2026, 7, 22, 9, 0).getTime();
const at = (hours: number) => T0 + hours * H;

describe('collapseToEpisodeOnsets', () => {
  it('collapses a tight run into one episode, keeping the FIRST instant', () => {
    // The canonical case: four vomits inside an hour is one bad episode, not four.
    const onsets = collapseToEpisodeOnsets([at(0), at(0.25), at(0.5), at(0.9)]);
    expect(onsets).toEqual([at(0)]);
  });

  it('splits when the gap EXCEEDS the threshold, not when it merely meets it', () => {
    // Boundary is `> gapMs`, so exactly 3h apart stays one episode.
    expect(collapseToEpisodeOnsets([at(0), at(SYMPTOM_EPISODE_GAP_HOURS)])).toEqual([at(0)]);
    expect(
      collapseToEpisodeOnsets([at(0), at(SYMPTOM_EPISODE_GAP_HOURS + 0.01)]),
    ).toHaveLength(2);
  });

  it('CHAINS the gap — a long drip is one episode however long it runs', () => {
    // Every event 2h after the last: one bad night, not twelve incidents. Measuring
    // from the onset instead would inflate every count in the engine.
    const drip = Array.from({ length: 12 }, (_, i) => at(i * 2));
    expect(collapseToEpisodeOnsets(drip)).toEqual([at(0)]);
  });

  it('is order-independent', () => {
    const shuffled = [at(7), at(0.5), at(14), at(0), at(7.5)];
    expect(collapseToEpisodeOnsets(shuffled)).toEqual(
      collapseToEpisodeOnsets([...shuffled].sort((a, b) => a - b)),
    );
  });

  it('converges — f(f(x)) === f(x)', () => {
    // The property `lib/protein.ts` carries for canonical keys, for the same reason:
    // an example list is what let a non-idempotent function ship under a docstring
    // claiming idempotence. Swept rather than spot-checked.
    for (let seed = 0; seed < 200; seed++) {
      const list = Array.from(
        { length: (seed % 9) + 1 },
        (_, i) => at(((seed * 7 + i * 13) % 97) / 3),
      );
      const once = collapseToEpisodeOnsets(list);
      expect(collapseToEpisodeOnsets(once)).toEqual(once);
    }
  });

  it('drops non-finite instants rather than propagating NaN', () => {
    // A NaN comparison is always false, which would silently merge or split episodes.
    expect(collapseToEpisodeOnsets([at(0), NaN, at(10)])).toEqual([at(0), at(10)]);
    expect(collapseToEpisodeOnsets([NaN, Infinity])).toEqual([]);
  });

  it('returns [] for an empty list', () => {
    expect(collapseToEpisodeOnsets([])).toEqual([]);
  });

  it('never returns more onsets than input events', () => {
    for (let n = 0; n <= 20; n++) {
      const list = Array.from({ length: n }, (_, i) => at(i * 5));
      expect(collapseToEpisodeOnsets(list).length).toBeLessThanOrEqual(n);
    }
  });
});

describe('countEpisodesInWindow', () => {
  it('counts an episode on the side its onset falls, not once per side', () => {
    // A run straddling the boundary: onset before, tail after. Collapse-then-filter
    // counts it once, in the window it BEGAN. Filter-then-collapse would count two.
    const boundary = at(10);
    const straddling = [at(9.5), at(10.5)]; // 1h apart -> one episode, onset at 9.5
    expect(countEpisodesInWindow(straddling, at(0), boundary)).toBe(1);
    expect(countEpisodesInWindow(straddling, boundary, at(20))).toBe(0);
  });

  it('is half-open — start inclusive, end exclusive', () => {
    expect(countEpisodesInWindow([at(5)], at(5), at(10))).toBe(1);
    expect(countEpisodesInWindow([at(10)], at(5), at(10))).toBe(0);
  });

  it('reproduces the CUL-372 contradiction case in the engine unit', () => {
    // Five raw vomit rows: four inside two hours on one day, one four days later.
    // Raw rows say 5; episodes say 2. The Trend card used to print the former beside
    // the Signal card printing the latter.
    const week = [at(0), at(0.5), at(1), at(2), at(96)];
    expect(week).toHaveLength(5);
    expect(countEpisodesInWindow(week, at(-1), at(200))).toBe(2);
  });
});
