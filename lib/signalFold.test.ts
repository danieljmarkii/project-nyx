// The fold store's contract (CUL-784 · `docs/nyx-signal-fold-requirements.md` §5).
//
// The load-bearing half is the §5.3 material-change table: a folded card must come back
// when the PET moved (a count rose, a newer episode, a tier flipped, a new week's pair)
// and must NOT come back when only the WINDOW moved (a count aging down). That asymmetry
// is walked here as a PROPERTY over `MATERIAL_FIELDS` rather than restated case by case —
// so a row added to the table is tested the moment it exists, and the table cannot drift
// from the test. Run red first by inverting the asymmetry in `materialChange` (C-18).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MATERIAL_FIELDS,
  SIGNAL_FOLD_STORAGE_KEY,
  clearSignalFold,
  canFold,
  foldFingerprint,
  foldIdentity,
  foldedEntry,
  materialChange,
  pruneFoldStore,
  readFoldEntries,
  reconcileFolds,
  writeFoldEntries,
  type FoldFingerprint,
  type PetFoldEntries,
} from './signalFold';
import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  InsightType,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SignalFinding,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimeOfDayClusteringFinding,
  TimingStoryFinding,
  TrialResponseFinding,
} from './signal';

const NOW = '2026-09-03T12:00:00.000Z';

// ── One base fixture per type, every material field populated ─────────────────
const correlation: CorrelationFinding = {
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  proteins: ['chicken'],
  jointCandidate: false,
  jointGuidance: null,
  matchedPairs: 4,
  symptomEventCount: 5,
  correlationWindowHours: 12,
};
const chronicity: SymptomChronicityFinding = {
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 56,
  activeWeeks: 5,
  symptomDays: 12,
  daysSinceLastEpisode: 3,
  firstOnsetIso: '2026-07-05T00:00:00.000Z',
  tier: 'standard',
  windowDays: 56,
};
const worsening: SymptomWorseningFinding = {
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 5,
  priorCount: 2,
  currentDays: 3,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 14,
};
const postprandial: PostprandialTimingFinding = {
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 8,
  eligibleCount: 8,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 14,
  feedingFormsInEvidence: [],
  windowDays: 60,
};
const timeofday: TimeOfDayClusteringFinding = {
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 2,
  clusterWindowHours: 4,
  clusterCount: 6,
  eligibleCount: 9,
  totalEpisodes: 12,
  timezone: 'America/New_York',
  windowDays: 60,
};
const emptyStomach: EmptyStomachTimingFinding = {
  type: 'empty_stomach_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  longCount: 7,
  eligibleCount: 20,
  bandCounts: { rapid: 3, mid: 10, long: 7 },
  totalEpisodes: 26,
  longGapHours: 6,
  lastTwoEligibleLong: false,
  medianHoursSinceFeeding: 9,
  feedingFormsInEvidence: [],
  clockBand: { startLocalHour: 2, windowHours: 6 },
  clockCount: 5,
  windowDays: 60,
};
const story: TimingStoryFinding = {
  type: 'timing_story',
  priorityClass: 'insight',
  symptomType: 'vomit',
  bandCounts: { rapid: 7, mid: 6, long: 7 },
  eligibleCount: 20,
  totalEpisodes: 26,
  rapidWindowMinutes: 30,
  longGapHours: 6,
  windowDays: 60,
  rapid: { count: 7, medianMinutesSinceFeeding: 12, lastTwoEligible: true, feedingFormsInEvidence: [] },
  long: {
    count: 7,
    medianHoursSinceFeeding: 9,
    lastTwoEligible: false,
    feedingFormsInEvidence: [],
    clockBand: { startLocalHour: 2, windowHours: 6 },
    clockCount: 6,
  },
};
const reflection: ReflectionFinding = {
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 5,
  direction: 'improving',
  windowDays: 14,
  density: { comparable: true, currentLoggingDays: 7, priorLoggingDays: 7 },
};
const trial: TrialResponseFinding = {
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 31,
  targetDurationDays: 42,
  trialLoggedDays: 28,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  pooledTrialCount: 4,
  pooledBaselineCount: 12,
  rapid: { trial: 2, baseline: 8 },
  mid: { trial: 1, baseline: 2 },
  long: { trial: 1, baseline: 2 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: 0.1, baseline: 0.2 },
  mealsPerDay: { trial: 2, baseline: 2 },
  comparisonDirection: 'fewer_during_trial',
  densityComparable: true,
  trialWindowDays: 31,
};
const intake: IntakeDeclineFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
};
const redFlag: IncidentRedFlagFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-09-01T08:00:00.000Z',
  flaggedIncidentCount: 2,
  windowDays: 14,
};

const BASE: Record<InsightType, SignalFinding> = {
  food_symptom_correlation: correlation,
  symptom_chronicity: chronicity,
  symptom_worsening: worsening,
  postprandial_timing: postprandial,
  timeofday_clustering: timeofday,
  empty_stomach_timing: emptyStomach,
  timing_story: story,
  reflection,
  trial_response: trial,
  intake_decline: intake,
  incident_red_flag: redFlag,
};
const TYPES = Object.keys(MATERIAL_FIELDS) as InsightType[];

// Deep-clone + set a dotted path.
function withPath<T extends SignalFinding>(finding: T, path: string, value: unknown): T {
  const copy = JSON.parse(JSON.stringify(finding)) as Record<string, unknown>;
  const segs = path.split('.');
  let cur = copy;
  for (const seg of segs.slice(0, -1)) {
    if (typeof cur[seg] !== 'object' || cur[seg] === null) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  if (value === undefined) delete cur[segs[segs.length - 1]];
  else cur[segs[segs.length - 1]] = value;
  return copy as unknown as T;
}
function getPath(finding: SignalFinding, path: string): unknown {
  let cur: unknown = finding;
  for (const seg of path.split('.')) cur = (cur as Record<string, unknown>)[seg];
  return cur;
}
// A value that differs from the current one, in the field's own kind.
function flipped(v: unknown): unknown {
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') return `${v}-changed`;
  if (Array.isArray(v)) return [...v, 'foreign_material'];
  if (v === null || v === undefined) return 'now-set';
  return JSON.stringify(v) + 'x';
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ── Identity (§5.2) ───────────────────────────────────────────────────────────
describe('foldIdentity — the finding key, never rank', () => {
  it('keys symptom-scoped types on type + symptom', () => {
    expect(foldIdentity(postprandial)).toBe('postprandial_timing:vomit');
    expect(foldIdentity({ ...reflection, symptomType: 'itch' })).toBe('reflection:itch');
  });
  it('keys a correlation on its sorted cluster — a member joining is a new identity', () => {
    expect(foldIdentity(correlation)).toBe('food_symptom_correlation:chicken');
    const joint = { ...correlation, protein: 'duck and chicken', proteins: ['duck', 'chicken'], jointCandidate: true };
    expect(foldIdentity(joint)).toBe('food_symptom_correlation:chicken+duck');
    expect(foldIdentity(joint)).not.toBe(foldIdentity(correlation));
  });
  it('falls back to the single label for a pre-slice-6 cached row (no `proteins`)', () => {
    const legacy = { ...correlation, proteins: undefined };
    expect(foldIdentity(legacy)).toBe('food_symptom_correlation:chicken');
  });
  it('a vomit red flag never covers a stool red flag', () => {
    expect(foldIdentity(redFlag)).not.toBe(foldIdentity({ ...redFlag, incidentType: 'stool' }));
  });
  it('trial_response and intake_decline are one per pet', () => {
    expect(foldIdentity(trial)).toBe('trial_response');
    expect(foldIdentity(intake)).toBe('intake_decline');
  });
  it('a lone postprandial that becomes a timing_story is a NEW identity', () => {
    expect(foldIdentity(postprandial)).not.toBe(foldIdentity(story));
  });
});

// ── The class gate (PR 1) ─────────────────────────────────────────────────────
describe('canFold — the PR 1 class line', () => {
  it('benign findings fold; safety findings do not (until PR 2 flips this)', () => {
    for (const t of TYPES) {
      expect(canFold(BASE[t])).toBe(BASE[t].priorityClass !== 'safety');
    }
  });
});

// ── The §5.3 property test ────────────────────────────────────────────────────
describe('materialChange — the per-type table, walked as a property', () => {
  it('every type has a row and every listed field exists on the base fixture', () => {
    for (const t of TYPES) {
      const spec = MATERIAL_FIELDS[t];
      const fields = [...spec.increaseOnly, ...spec.decreaseOnly, ...spec.turnOn, ...spec.anyChange];
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        // turnOn fields may legitimately be absent on the base (the adjacency is optional).
        if (spec.turnOn.includes(f)) continue;
        expect(getPath(BASE[t], f)).toBeDefined();
      }
    }
  });

  it('the same payload never re-opens — the 24h regen alone is not a change', () => {
    for (const t of TYPES) {
      const fp = foldFingerprint(BASE[t]);
      expect(materialChange(fp, foldFingerprint(BASE[t]))).toBeNull();
      // A structurally-equal clone, not the same object.
      expect(materialChange(fp, foldFingerprint(JSON.parse(JSON.stringify(BASE[t]))))).toBeNull();
    }
  });

  it('INCREASE ⇒ re-opens, for every increase-only field of every type', () => {
    for (const t of TYPES) {
      for (const f of MATERIAL_FIELDS[t].increaseOnly) {
        const base = BASE[t];
        const next = withPath(base, f, (getPath(base, f) as number) + 1);
        expect([t, f, materialChange(foldFingerprint(base), foldFingerprint(next))]).toEqual([
          t, f, MATERIAL_FIELDS[t].reason(f, 'increase'),
        ]);
      }
    }
  });

  it('DECREASE-ONLY ⇒ stays folded: every count aging down at once, nothing else moving', () => {
    for (const t of TYPES) {
      const spec = MATERIAL_FIELDS[t];
      if (spec.increaseOnly.length === 0) continue;
      let next = BASE[t];
      for (const f of spec.increaseOnly) next = withPath(next, f, (getPath(next, f) as number) - 1);
      expect([t, materialChange(foldFingerprint(BASE[t]), foldFingerprint(next))]).toEqual([t, null]);
    }
  });

  it('a decrease-only field re-opens on a FALL (a newer episode) and never on a rise', () => {
    for (const t of TYPES) {
      for (const f of MATERIAL_FIELDS[t].decreaseOnly) {
        const base = BASE[t];
        const v = getPath(base, f) as number;
        expect(materialChange(foldFingerprint(base), foldFingerprint(withPath(base, f, v - 1)))).toBe(
          MATERIAL_FIELDS[t].reason(f, 'decrease'),
        );
        expect(materialChange(foldFingerprint(base), foldFingerprint(withPath(base, f, v + 1)))).toBeNull();
      }
    }
  });

  it('a turn-on field re-opens when it turns on, and not when it turns off', () => {
    for (const t of TYPES) {
      for (const f of MATERIAL_FIELDS[t].turnOn) {
        const off = withPath(BASE[t], f, undefined);
        const on = withPath(BASE[t], f, true);
        expect(materialChange(foldFingerprint(off), foldFingerprint(on))).toBe(MATERIAL_FIELDS[t].reason(f, 'turn_on'));
        expect(materialChange(foldFingerprint(on), foldFingerprint(off))).toBeNull();
      }
    }
  });

  it('FLIP ⇒ re-opens, for every any-change field of every type (in either direction)', () => {
    for (const t of TYPES) {
      for (const f of MATERIAL_FIELDS[t].anyChange) {
        const base = BASE[t];
        const next = withPath(base, f, flipped(getPath(base, f)));
        const reason = MATERIAL_FIELDS[t].reason(f, 'change');
        expect([t, f, materialChange(foldFingerprint(base), foldFingerprint(next))]).toEqual([t, f, reason]);
        expect([t, f, materialChange(foldFingerprint(next), foldFingerprint(base))]).toEqual([t, f, reason]);
      }
    }
  });

  it('chronicity: a net-zero episode count with a NEWER last episode re-opens', () => {
    // One episode aged out of the window on the day a new one landed: episodeCount 14 → 14,
    // daysSinceLastEpisode 3 → 0. Without the decrease-only row this day is invisible.
    const next = { ...chronicity, daysSinceLastEpisode: 0 };
    expect(materialChange(foldFingerprint(chronicity), foldFingerprint(next))).toBe('new_episode');
  });

  it('correlation: Early pattern → established says so', () => {
    const next = { ...correlation, tier: 'established' as const };
    expect(materialChange(foldFingerprint(correlation), foldFingerprint(next))).toBe('tier_established');
  });

  it('red flag: a newer flagged photo re-opens; the same photo re-cached does not', () => {
    const newer = { ...redFlag, mostRecentFlaggedIso: '2026-09-02T08:00:00.000Z' };
    expect(materialChange(foldFingerprint(redFlag), foldFingerprint(newer))).toBe('photo_record');
    // Flag order is a set, not a sequence.
    const reordered: IncidentRedFlagFinding = { ...redFlag, flags: ['foreign_material', 'blood'] };
    const base2: IncidentRedFlagFinding = { ...redFlag, flags: ['blood', 'foreign_material'] };
    expect(materialChange(foldFingerprint(base2), foldFingerprint(reordered))).toBeNull();
  });

  it('intake decline: day 3 → day 4 re-opens (the acute fold is a one-day fold)', () => {
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, daysBelowBaseline: 4 }))).toBe('intake_day');
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, ratedMealsConsidered: 12 }))).toBeNull();
  });

  it('a field the stored fingerprint never carried is skipped, not treated as a change', () => {
    // An upgrade that adds a row to the table must not re-open every fold on the device.
    const stored: FoldFingerprint = { type: 'postprandial_timing', rapidCount: 8 };
    expect(materialChange(stored, foldFingerprint(postprandial))).toBeNull();
    expect(materialChange(stored, foldFingerprint({ ...postprandial, rapidCount: 9 }))).toBe('new_episode');
  });

  it('is a pure function of (prev, next) — it never reads the clock', () => {
    const now = jest.spyOn(Date, 'now');
    const ctor = jest.spyOn(global, 'Date');
    for (const t of TYPES) {
      materialChange(foldFingerprint(BASE[t]), foldFingerprint(BASE[t]));
      reconcileFolds({ [foldIdentity(BASE[t])]: foldedEntry(BASE[t], NOW) }, [BASE[t]], NOW);
    }
    expect(now).not.toHaveBeenCalled();
    expect(ctor).not.toHaveBeenCalled();
    now.mockRestore();
    ctor.mockRestore();
  });
});

// ── reconcileFolds (§5.3 release rules) ───────────────────────────────────────
describe('reconcileFolds', () => {
  const key = foldIdentity(postprandial);

  it('returns the same object and changed=false when nothing moved', () => {
    const entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW) };
    const r = reconcileFolds(entries, [postprandial, chronicity], NOW);
    expect(r.changed).toBe(false);
    expect(r.entries).toBe(entries);
  });

  it('an ABSENT key deletes the entry — a re-fired finding renders as a full card', () => {
    const entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW) };
    const r = reconcileFolds(entries, [chronicity], NOW);
    expect(r.changed).toBe(true);
    expect(r.entries).toEqual({});
  });

  it('a material change releases the fold as `reopened` with its reason and stamps the given time', () => {
    const entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW) };
    const later = '2026-09-04T09:00:00.000Z';
    const r = reconcileFolds(entries, [{ ...postprandial, rapidCount: 9, eligibleCount: 9 }], later);
    expect(r.entries[key]).toMatchObject({ state: 'reopened', reason: 'new_episode', atIso: later });
  });

  it('a window aging down keeps the fold AND lowers the baseline, so the next episode counts', () => {
    // Fold at 8; the window ages to 6; a new episode makes 7. Against the fold-day 8 that
    // would read as a decrease; against the record it is the new episode it is.
    let entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW) };
    let r = reconcileFolds(entries, [{ ...postprandial, rapidCount: 6, eligibleCount: 6 }], NOW);
    expect(r.changed).toBe(true);
    expect(r.entries[key].state).toBe('folded');
    entries = r.entries;
    r = reconcileFolds(entries, [{ ...postprandial, rapidCount: 7, eligibleCount: 7 }], NOW);
    expect(r.entries[key]).toMatchObject({ state: 'reopened', reason: 'new_episode' });
  });

  it('a reopened entry clears on the next fingerprint change of any kind', () => {
    const reopened: PetFoldEntries = {
      [key]: { state: 'reopened', reason: 'new_episode', fingerprint: foldFingerprint(postprandial), atIso: NOW },
    };
    // Unchanged → the line stays (the owner has not touched the card yet).
    expect(reconcileFolds(reopened, [postprandial], NOW).changed).toBe(false);
    // Any movement, even a decrease → the entry is gone.
    const r = reconcileFolds(reopened, [{ ...postprandial, rapidCount: 5, eligibleCount: 5 }], NOW);
    expect(r.entries).toEqual({});
  });

  it('never touches another finding’s entry (FS-7 — a fold on one never suppresses another)', () => {
    const k2 = foldIdentity(reflection);
    const entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW), [k2]: foldedEntry(reflection, NOW) };
    const r = reconcileFolds(entries, [{ ...postprandial, rapidCount: 9 }, reflection], NOW);
    expect(r.entries[k2]).toBe(entries[k2]);
    expect(r.entries[key].state).toBe('reopened');
  });
});

// ── The AsyncStorage shell ────────────────────────────────────────────────────
describe('the store shell', () => {
  it('reads {} for a pet with nothing folded, and persists what is written', async () => {
    expect(await readFoldEntries('pet-a')).toEqual({});
    const entries = { [foldIdentity(postprandial)]: foldedEntry(postprandial, NOW) };
    await writeFoldEntries('pet-a', entries);
    expect(await readFoldEntries('pet-a')).toEqual(entries);
  });

  it('is PER PET — one pet’s fold is never another’s', async () => {
    await writeFoldEntries('pet-a', { [foldIdentity(postprandial)]: foldedEntry(postprandial, NOW) });
    expect(await readFoldEntries('pet-b')).toEqual({});
  });

  it('accumulates across pets rather than clobbering (a read-modify-write)', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    await writeFoldEntries('pet-b', { b: foldedEntry(reflection, NOW) });
    expect(await readFoldEntries('pet-a')).toHaveProperty('a');
    expect(await readFoldEntries('pet-b')).toHaveProperty('b');
  });

  it('an empty map removes the pet’s key rather than storing an empty object', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    await writeFoldEntries('pet-a', {});
    expect(JSON.parse((await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY)) as string)).toEqual({});
  });

  it('returns NULL — not {} — when storage cannot be read (C-12: unanswered ≠ empty)', async () => {
    // Swapped by hand rather than with jest.spyOn: restoring a spy over AsyncStorage's own
    // jest mock leaves the mock's storage inconsistent for later cases in this file (the
    // signalArrival test's note).
    const realGet = AsyncStorage.getItem.bind(AsyncStorage);
    (AsyncStorage as unknown as { getItem: () => Promise<string | null> }).getItem = async () => {
      throw new Error('storage unavailable');
    };
    expect(await readFoldEntries('pet-a')).toBeNull();
    (AsyncStorage as unknown as { getItem: typeof realGet }).getItem = realGet;
  });

  it('discards a corrupted or foreign blob entry by entry, never trusting it', async () => {
    await AsyncStorage.setItem(SIGNAL_FOLD_STORAGE_KEY, 'not json');
    expect(await readFoldEntries('pet-a')).toEqual({});
    await AsyncStorage.setItem(
      SIGNAL_FOLD_STORAGE_KEY,
      JSON.stringify({ 'pet-a': { good: foldedEntry(postprandial, NOW), bad: { state: 'folded' }, worse: 7 } }),
    );
    expect(Object.keys((await readFoldEntries('pet-a')) ?? {})).toEqual(['good']);
    await AsyncStorage.setItem(SIGNAL_FOLD_STORAGE_KEY, '["pet-a"]');
    expect(await readFoldEntries('pet-a')).toEqual({});
  });

  it('prunes pets this device no longer knows, keeping the rest', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    await writeFoldEntries('pet-gone', { g: foldedEntry(reflection, NOW) });
    await pruneFoldStore(['pet-a']);
    expect(await readFoldEntries('pet-a')).toHaveProperty('a');
    expect(await readFoldEntries('pet-gone')).toEqual({});
  });

  it('clearSignalFold removes every pet’s entries, and is idempotent', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    await clearSignalFold();
    expect(await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY)).toBeNull();
    await expect(clearSignalFold()).resolves.toBeUndefined();
  });

  it('abandons a write whose read straddled clearSignalFold() — the map cannot resurrect', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    const realGet = AsyncStorage.getItem.bind(AsyncStorage);
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let gatedOnce = false;
    (AsyncStorage as unknown as { getItem: (k: string) => Promise<string | null> }).getItem =
      async (k: string) => {
        if (gatedOnce) return realGet(k);
        gatedOnce = true;
        const v = await realGet(k);
        await held;
        return v;
      };
    const inFlight = writeFoldEntries('pet-b', { b: foldedEntry(reflection, NOW) });
    await clearSignalFold();
    release();
    await inFlight;
    (AsyncStorage as unknown as { getItem: typeof realGet }).getItem = realGet;
    expect(await readFoldEntries('pet-a')).toEqual({});
    expect(await readFoldEntries('pet-b')).toEqual({});
  });

  it('a write that starts AFTER the clear is a normal write', async () => {
    await clearSignalFold();
    await writeFoldEntries('pet-new', { n: foldedEntry(postprandial, NOW) });
    expect(await readFoldEntries('pet-new')).toHaveProperty('n');
  });

  it('never throws — a write or clear failure is logged, not raised', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const set = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) })).resolves.toBeUndefined();
    set.mockRestore();
    const rm = jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('nope'));
    await expect(clearSignalFold()).resolves.toBeUndefined();
    rm.mockRestore();
    warn.mockRestore();
  });
});
