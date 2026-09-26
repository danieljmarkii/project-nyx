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
  INTAKE_DECLINE_FOLDS,
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
  setFactsFor,
  specPaths,
  writeFoldEntries,
  type FoldFingerprint,
  type PetFoldEntries,
  type RecordFacts,
} from './signalFold';
import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  StoodDownMarker,
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

// CUL-786 — the labeled stand-down marker: not a card, never foldable.
const stoodDown: StoodDownMarker = {
  type: 'stood_down',
  priorityClass: 'insight',
  symptomType: 'vomit',
  recencyDays: 14,
  tier: 'firm',
  lastEpisodeIso: '2026-08-19T11:00:00.000Z',
  stoodDownAt: '2026-09-03T12:00:00.000Z',
  formerRank: 0,
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
  stood_down: stoodDown,
};
// The property walks cover every FOLDABLE-OR-SAFETY type. The stood-down marker (CUL-786) is
// neither — a line, not a card, `canFold` refuses it — so its table row is inert by design and
// is pinned separately below rather than walked (an empty row would fail the "has fields" walk
// for the right reason: it is not a card and carries no material fields).
const TYPES = (Object.keys(MATERIAL_FIELDS) as InsightType[]).filter((t) => t !== 'stood_down');

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

// ── The class gate (DF-2, CUL-785) ────────────────────────────────────────────
describe('canFold — every card folds, the safety class included (DF-2)', () => {
  it('benign findings fold; the standing safety class folds; the red flag folds', () => {
    for (const t of TYPES) {
      if (t === 'intake_decline') continue;
      expect([t, canFold(BASE[t])]).toEqual([t, true]);
    }
  });

  it('intake decline is HELD CLOSED behind the one named constant (CUL-785 brief A), and the hold is the whole reason', () => {
    // The ruling's bound — "daysBelowBaseline climbs daily" — does not hold in the shipped
    // detector (a constant 1 / 2, and 0 on a refusal), so an intake fold would be unbounded.
    // When the engine moves the field, flipping the constant is the entire change.
    expect(canFold(intake)).toBe(INTAKE_DECLINE_FOLDS);
    expect(canFold({ ...intake, trigger: 'refused_normal_food', daysBelowBaseline: 0 })).toBe(INTAKE_DECLINE_FOLDS);
    expect(INTAKE_DECLINE_FOLDS).toBe(false);
  });

  it('CUL-786: a stood-down marker never folds — insight class, but a line, not a card', () => {
    expect(stoodDown.priorityClass).toBe('insight');
    expect(canFold(stoodDown)).toBe(false);
    // Its table row is inert: no material field, so the same payload is never a change and a
    // stray entry could never be re-opened by it.
    const spec = MATERIAL_FIELDS.stood_down;
    expect(specPaths(spec)).toHaveLength(0);
    expect(materialChange(foldFingerprint(stoodDown), foldFingerprint(stoodDown))).toBeNull();
    // Its identity is its own — a marker's presence never shadows the chronicity key, so when
    // the course re-fires the finding returns under its own key and renders open.
    expect(foldIdentity(stoodDown)).not.toBe(foldIdentity(chronicity));
  });
});

// ── The §5.3 property test ────────────────────────────────────────────────────
describe('materialChange — the per-type table, walked as a property', () => {
  it('every type has a row and every listed field exists on the base fixture', () => {
    for (const t of TYPES) {
      const spec = MATERIAL_FIELDS[t];
      const fields = [
        ...spec.increaseOnly,
        ...spec.decreaseOnly,
        ...spec.promoteOnly.map(({ path }) => path),
        ...spec.anyChange,
      ];
      expect(fields.length).toBeGreaterThan(0);
      // An arrives-with-pair flag may legitimately be absent on the base (the adjacency is
      // optional); its pair is a `set.*` fact, read from the set and never from the finding.
      for (const f of fields) expect(getPath(BASE[t], f)).toBeDefined();
      for (const { pair } of spec.arrivesWithPair) expect(pair.startsWith('set.')).toBe(true);
      // A promotion order names every value the field can hold on the base, so the walk below
      // is never vacuous.
      for (const { path, order } of spec.promoteOnly) expect(order).toContain(getPath(BASE[t], path));
      // A record witness is a `record.*` path (read from RecordFacts, never the finding), and
      // only the two standing safety types carry one (CUL-785).
      for (const f of spec.laterInstant) expect(f.startsWith('record.')).toBe(true);
      expect(spec.laterInstant.length > 0).toBe(t === 'symptom_chronicity' || t === 'symptom_worsening');
    }
  });

  it('LATER instant ⇒ re-opens as a new episode; the same or an EARLIER instant never does', () => {
    const before: RecordFacts = { lastEpisodeIso: '2026-08-26T15:00:00.000Z' };
    const later: RecordFacts = { lastEpisodeIso: '2026-09-04T07:30:00.000Z' };
    const earlier: RecordFacts = { lastEpisodeIso: '2026-08-20T15:00:00.000Z' };
    for (const t of TYPES) {
      for (const f of MATERIAL_FIELDS[t].laterInstant) {
        const base = BASE[t];
        expect([t, f, materialChange(foldFingerprint(base, before), foldFingerprint(base, later))]).toEqual([t, f, 'new_episode']);
        expect(materialChange(foldFingerprint(base, before), foldFingerprint(base, before))).toBeNull();
        expect(materialChange(foldFingerprint(base, before), foldFingerprint(base, earlier))).toBeNull();
        // A witness that never answered on either side decides nothing.
        expect(materialChange(foldFingerprint(base, {}), foldFingerprint(base, later))).toBeNull();
        expect(materialChange(foldFingerprint(base, before), foldFingerprint(base, { lastEpisodeIso: null }))).toBeNull();
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

  it('an arrives-with-pair flag re-opens when it arrives WITH the pair, never when it hops to this card or turns off', () => {
    let walked = 0;
    for (const t of TYPES) {
      for (const { path, pair } of MATERIAL_FIELDS[t].arrivesWithPair) {
        const key = pair.slice('set.'.length);
        const off = withPath(BASE[t], path, undefined);
        const on = withPath(BASE[t], path, true);
        const solo = { [key]: false };
        const paired = { [key]: true };
        // The pair forms and the flag lands here: the ask changed on this card.
        expect(materialChange(foldFingerprint(off, {}, solo), foldFingerprint(on, {}, paired))).toBe(
          MATERIAL_FIELDS[t].reason(path, 'turn_on'),
        );
        // The pair already stood and the flag moved here from the other card: a window slide.
        expect(materialChange(foldFingerprint(off, {}, paired), foldFingerprint(on, {}, paired))).toBeNull();
        // It left this card, or the pair came apart.
        expect(materialChange(foldFingerprint(on, {}, paired), foldFingerprint(off, {}, paired))).toBeNull();
        expect(materialChange(foldFingerprint(on, {}, paired), foldFingerprint(off, {}, solo))).toBeNull();
        // The pair formed but the flag landed on the OTHER card: nothing changed on this one.
        expect(materialChange(foldFingerprint(off, {}, solo), foldFingerprint(off, {}, paired))).toBeNull();
        // A stored fingerprint with no pair fact (an older build, or a fold written without the
        // set) cannot tell an arrival from a hop, so it decides nothing.
        expect(materialChange(foldFingerprint(off), foldFingerprint(on, {}, paired))).toBeNull();
        walked++;
      }
    }
    expect(walked).toBeGreaterThan(0);
  });

  it('a promote-only field re-opens on a promotion, and stays folded on a demotion or an unknown value', () => {
    let walked = 0;
    for (const t of TYPES) {
      for (const { path, order } of MATERIAL_FIELDS[t].promoteOnly) {
        for (let i = 0; i < order.length; i++) {
          for (let j = 0; j < order.length; j++) {
            const prev = foldFingerprint(withPath(BASE[t], path, order[i]));
            const next = foldFingerprint(withPath(BASE[t], path, order[j]));
            expect([t, path, order[i], order[j], materialChange(prev, next)]).toEqual([
              t, path, order[i], order[j], j > i ? MATERIAL_FIELDS[t].reason(path, 'promote') : null,
            ]);
            walked++;
          }
        }
        const top = foldFingerprint(withPath(BASE[t], path, order[order.length - 1]));
        expect(materialChange(top, foldFingerprint(withPath(BASE[t], path, 'unknown-tier')))).toBeNull();
        expect(materialChange(foldFingerprint(withPath(BASE[t], path, 'unknown-tier')), top)).toBeNull();
      }
    }
    expect(walked).toBeGreaterThan(0);
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

  it('the saturated course (adversarial pass, 2026-09-04): a pet vomiting daily moves NO engine field — the record’s witness re-opens the fold', () => {
    // 56 episodes in a 56-day window at one a day: episodeCount at the window's capacity,
    // activeWeeks at its ceiling, daysSinceLastEpisode floored at 0, tier pinned firm. Ten new
    // episodes later the payload is byte-identical.
    const saturated: SymptomChronicityFinding = {
      ...chronicity, episodeCount: 56, activeWeeks: 8, symptomDays: 56, daysSinceLastEpisode: 0, tier: 'firm',
    };
    const foldDay: RecordFacts = { lastEpisodeIso: '2026-09-03T08:00:00.000Z' };
    const nextDay: RecordFacts = { lastEpisodeIso: '2026-09-04T08:10:00.000Z' };
    // Without the witness the fold is a fixed point — this is the break the pass reproduced.
    expect(materialChange(foldFingerprint(saturated, {}), foldFingerprint(saturated, {}))).toBeNull();
    // With it, the next morning's episode brings the card back.
    expect(materialChange(foldFingerprint(saturated, foldDay), foldFingerprint(saturated, nextDay))).toBe('new_episode');
  });

  it('correlation: Early pattern → established says so', () => {
    const next = { ...correlation, tier: 'established' as const };
    expect(materialChange(foldFingerprint(correlation), foldFingerprint(next))).toBe('tier_established');
  });

  it('CUL-1273: a correlation DEMOTED to Early (prednisone capping it) stays folded — never "now established"', () => {
    // The critique's counterexample: an established chicken card folded; a medication starts and
    // caps it at Early. The old table named every tier change `tier_established`.
    const established = { ...correlation, tier: 'established' as const };
    expect(materialChange(foldFingerprint(established), foldFingerprint(correlation))).toBeNull();
    // Through the reconcile: stays folded, and the fingerprint follows the tier down, so a later
    // re-promotion is judged from Early and says so.
    const key = foldIdentity(correlation);
    let r = reconcileFolds({ [key]: foldedEntry(established, NOW) }, [correlation], NOW);
    expect(r.entries[key].state).toBe('folded');
    expect(r.entries[key].fingerprint.tier).toBe('early');
    r = reconcileFolds(r.entries, [established], NOW);
    expect(r.entries[key]).toMatchObject({ state: 'reopened', reason: 'tier_established' });
  });

  it('a folded chronicity card whose ask FIRMS UP still re-opens (the CUL-1273 fix narrows only the adjacency)', () => {
    const firm = { ...chronicity, tier: 'firm' as const };
    expect(materialChange(foldFingerprint(chronicity), foldFingerprint(firm))).toBe('ask_changed');
    const key = foldIdentity(chronicity);
    const r = reconcileFolds({ [key]: foldedEntry(chronicity, NOW) }, [firm], NOW);
    expect(r.entries[key]).toMatchObject({ state: 'reopened', reason: 'ask_changed' });
  });

  it('red flag: a newer flagged photo re-opens; the same photo re-cached does not', () => {
    const newer = { ...redFlag, mostRecentFlaggedIso: '2026-09-02T08:00:00.000Z' };
    expect(materialChange(foldFingerprint(redFlag), foldFingerprint(newer))).toBe('photo_record');
    // Flag order is a set, not a sequence.
    const reordered: IncidentRedFlagFinding = { ...redFlag, flags: ['foreign_material', 'blood'] };
    const base2: IncidentRedFlagFinding = { ...redFlag, flags: ['blood', 'foreign_material'] };
    expect(materialChange(foldFingerprint(base2), foldFingerprint(reordered))).toBeNull();
  });

  it('intake decline: day 3 → day 4 re-opens (the acute fold is a one-day fold — once the engine moves the field)', () => {
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, daysBelowBaseline: 4 }))).toBe('intake_day');
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, ratedMealsConsidered: 12 }))).toBeNull();
    // A trigger flip (a refusal arriving on top of a decline) or a different refused food is
    // the ask changing; the species field is never a trigger.
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, trigger: 'refused_normal_food' }))).toBe('ask_changed');
    expect(materialChange(foldFingerprint(intake), foldFingerprint({ ...intake, species: 'dog' }))).toBeNull();
  });

  it('red flag: nothing but the photo record re-opens it — the window aging is not a trigger', () => {
    expect(materialChange(foldFingerprint(redFlag), foldFingerprint({ ...redFlag, windowDays: 21 }))).toBeNull();
    // The same photo, re-cached with the count one lower because an older flagged photo aged
    // out: stays folded (a count falling is the window, not the pet).
    expect(materialChange(foldFingerprint(redFlag), foldFingerprint({ ...redFlag, flaggedIncidentCount: 1 }))).toBeNull();
    // A second flag kind on the same photo record: the set changed → back.
    expect(materialChange(foldFingerprint(redFlag), foldFingerprint({ ...redFlag, flags: ['blood', 'foreign_material'] }))).toBe('photo_record');
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

  it('the record witness rides reconcileFolds: a newer local episode re-opens the fold with NO change to the payload (offline)', () => {
    const ck = foldIdentity(chronicity);
    const foldDay = { lastEpisodeIso: '2026-09-03T08:00:00.000Z' };
    // Folded as the hook folds it: with the set's facts (CUL-1273), so the reconcile has
    // nothing to add and "nothing moved" means nothing moved.
    const entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW, foldDay, setFactsFor(chronicity, [chronicity])) };
    // The same payload, the same day: nothing.
    expect(reconcileFolds(entries, [chronicity], NOW, () => foldDay).changed).toBe(false);
    // The owner logs a vomit; the regen has not landed; the record's newest instant moved.
    const r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-09-04T07:30:00.000Z' }));
    expect(r.entries[ck]).toMatchObject({ state: 'reopened', reason: 'new_episode' });
  });

  it('a read that did not answer never erases the witness a fold holds (keepWitnesses)', () => {
    const ck = foldIdentity(chronicity);
    const foldDay = { lastEpisodeIso: '2026-09-03T08:00:00.000Z' };
    let entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW, foldDay, setFactsFor(chronicity, [chronicity])) };
    // Transient store failure: the record reads null. Not a change, and the witness survives.
    let r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: null }));
    expect(r.changed).toBe(false);
    expect(r.entries[ck].fingerprint['record.lastEpisodeIso']).toBe(foldDay.lastEpisodeIso);
    entries = r.entries;
    // The store answers again with a newer episode: judged against the KEPT witness → back.
    r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-09-04T07:30:00.000Z' }));
    expect(r.entries[ck]).toMatchObject({ state: 'reopened', reason: 'new_episode' });
    // And a reopened line is not cleared by a transient null either.
    r = reconcileFolds(r.entries, [chronicity], NOW, () => ({ lastEpisodeIso: null }));
    expect(r.entries[ck].state).toBe('reopened');
  });

  it('a fold stored with no witness (unread at fold time, or a PR 1 entry) gains one on the next read and re-opens on the episode after', () => {
    const ck = foldIdentity(chronicity);
    let entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW) };
    // The record now answers: not material (nothing to compare against), the stored
    // fingerprint follows the record (rule 3), the fold stays.
    let r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-09-03T08:00:00.000Z' }));
    expect(r.changed).toBe(true);
    expect(r.entries[ck].state).toBe('folded');
    entries = r.entries;
    r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-09-04T07:30:00.000Z' }));
    expect(r.entries[ck]).toMatchObject({ state: 'reopened', reason: 'new_episode' });
    // A PR 1 entry (no `record.*` key at all) is skipped, never treated as a change.
    const legacy: PetFoldEntries = { [ck]: { state: 'folded', fingerprint: { ...foldFingerprint(chronicity), 'record.lastEpisodeIso': undefined as never }, foldedAtIso: NOW } };
    delete (legacy[ck].fingerprint as Record<string, unknown>)['record.lastEpisodeIso'];
    const up = reconcileFolds(legacy, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-09-04T07:30:00.000Z' }));
    expect(up.entries[ck].state).toBe('folded');
  });

  it('a deleted episode moves the witness EARLIER: not a re-open, and the fold follows the record down', () => {
    const ck = foldIdentity(chronicity);
    const entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW, { lastEpisodeIso: '2026-09-03T08:00:00.000Z' }) };
    const r = reconcileFolds(entries, [chronicity], NOW, () => ({ lastEpisodeIso: '2026-08-30T08:00:00.000Z' }));
    expect(r.entries[ck].state).toBe('folded');
    expect(r.entries[ck].fingerprint['record.lastEpisodeIso']).toBe('2026-08-30T08:00:00.000Z');
  });

  it('improving-then-relapsing (Dr. Chen’s falsification set): a folded course that stands down is RELEASED, so its re-fire renders as a full card', () => {
    const ck = foldIdentity(chronicity);
    // Day 0: the owner folds the chronicity card.
    let entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW) };
    // Weeks later the course goes quiet: the finding leaves the set and the labeled stand-down
    // marker (CUL-786) takes its slot. The marker is a different key, so the fold's key is
    // ABSENT → the entry is deleted (release rule 1), not carried over onto the marker.
    let r = reconcileFolds(entries, [stoodDown, postprandial], NOW);
    expect(r.changed).toBe(true);
    expect(r.entries).toEqual({});
    entries = r.entries;
    // The course relapses: chronicity re-fires with a SMALLER count than the day it was folded
    // (the window slid). Against the fold-day fingerprint that would have read as "no
    // material change" and kept the strip; with the entry gone, nothing is folded and the
    // card renders open — and no Back-because line either (there is no memory to be back from).
    const relapse = { ...chronicity, episodeCount: 9, activeWeeks: 3, daysSinceLastEpisode: 0 };
    r = reconcileFolds(entries, [relapse, postprandial], NOW);
    expect(r.changed).toBe(false);
    expect(r.entries[ck]).toBeUndefined();
  });

  it('the refusing cat: a folded chronicity is untouched by intake decline arriving above it (FS-7), and never inherits its release', () => {
    const ck = foldIdentity(chronicity);
    const entries: PetFoldEntries = { [ck]: foldedEntry(chronicity, NOW, {}, setFactsFor(chronicity, [chronicity])) };
    // Intake decline fires at rank 0 (a new safety finding lands as a full card above the
    // strip); the chronicity fold is neither released nor re-keyed by it.
    const r = reconcileFolds(entries, [intake, chronicity], NOW);
    expect(r.changed).toBe(false);
    expect(r.entries[ck].state).toBe('folded');
  });

  it('never touches another finding’s entry (FS-7 — a fold on one never suppresses another)', () => {
    const k2 = foldIdentity(reflection);
    const entries: PetFoldEntries = { [key]: foldedEntry(postprandial, NOW), [k2]: foldedEntry(reflection, NOW) };
    const r = reconcileFolds(entries, [{ ...postprandial, rapidCount: 9 }, reflection], NOW);
    expect(r.entries[k2]).toBe(entries[k2]);
    expect(r.entries[key].state).toBe('reopened');
  });
});

// ── CUL-1273 (BRK-12): the cough↔vomit leader swap ────────────────────────────
//
// The engine marks the pair's disclosure on whichever chronicity course LEADS, and the lead
// swaps at unchanged counts as old onsets age out (7 times in 54 co-chronic evenings on the
// dogfood replay). Keyed to the card's own flag, every swap re-opened the card it landed on
// with "Back because the vet ask changed." Keyed to the pair, only the pair forming does.
describe('CUL-1273 — the cough↔vomit note re-opens on the pair forming, never on a leader swap', () => {
  const vomitCard: SymptomChronicityFinding = { ...chronicity, symptomType: 'vomit' };
  const coughCard: SymptomChronicityFinding = { ...chronicity, symptomType: 'cough', episodeCount: 9 };
  const vk = foldIdentity(vomitCard);
  const ck = foldIdentity(coughCard);
  const vomitLeads = [{ ...vomitCard, coughVomitAdjacent: true as const }, coughCard];
  const coughLeads = [{ ...coughCard, coughVomitAdjacent: true as const }, vomitCard];

  it('the pair fact is carried on BOTH cards, from the engine’s one mark, and on nothing else', () => {
    expect(setFactsFor(vomitLeads[0], vomitLeads)).toEqual({ coughVomitPair: true });
    expect(setFactsFor(vomitLeads[1], vomitLeads)).toEqual({ coughVomitPair: true });
    expect(setFactsFor(vomitCard, [vomitCard])).toEqual({ coughVomitPair: false });
    const diarrhea: SymptomChronicityFinding = { ...chronicity, symptomType: 'diarrhea' };
    expect(setFactsFor(diarrhea, [...vomitLeads, diarrhea])).toEqual({});
    expect(setFactsFor(postprandial, vomitLeads)).toEqual({});
  });

  it('a net-zero day that swaps the leader re-opens NEITHER folded card', () => {
    // Both cards folded while vomiting led; the next regen, at identical counts, cough leads.
    const entries: PetFoldEntries = {
      [vk]: foldedEntry(vomitLeads[0], NOW, {}, setFactsFor(vomitLeads[0], vomitLeads)),
      [ck]: foldedEntry(vomitLeads[1], NOW, {}, setFactsFor(vomitLeads[1], vomitLeads)),
    };
    const r = reconcileFolds(entries, coughLeads, NOW);
    expect(r.entries[vk].state).toBe('folded');
    expect(r.entries[ck].state).toBe('folded');
    // And back again the day after: still folded.
    const back = reconcileFolds(r.entries, vomitLeads, NOW);
    expect(back.entries[vk].state).toBe('folded');
    expect(back.entries[ck].state).toBe('folded');
  });

  it('the pair FORMING re-opens the card the note lands on, and only that card', () => {
    // Vomiting folded alone; then the cough course turns chronic. The usual order: vomiting leads.
    const soloFold: PetFoldEntries = { [vk]: foldedEntry(vomitCard, NOW, {}, setFactsFor(vomitCard, [vomitCard])) };
    const formed = reconcileFolds(soloFold, vomitLeads, NOW);
    expect(formed.entries[vk]).toMatchObject({ state: 'reopened', reason: 'ask_changed' });
    // The unusual order: the NEW cough course leads, so the note lands on its (open) card and the
    // folded vomiting card's face is unchanged. It stays folded.
    const formedOther = reconcileFolds(soloFold, coughLeads, NOW);
    expect(formedOther.entries[vk].state).toBe('folded');
  });

  it('the upgrade seam: a fold stored before the pair fact existed never re-opens on a swap', () => {
    // An older build's fingerprint of the vomiting card while cough led: the flag's key (off),
    // no `set.*` key. Then the lead swaps to vomiting at identical counts.
    const legacy = foldFingerprint(vomitCard);
    expect(legacy).toHaveProperty('coughVomitAdjacent', null);
    expect(legacy).not.toHaveProperty('set.coughVomitPair');
    const entries: PetFoldEntries = { [vk]: { state: 'folded', fingerprint: legacy, foldedAtIso: NOW } };
    const r = reconcileFolds(entries, vomitLeads, NOW);
    expect(r.entries[vk].state).toBe('folded');
    // …and the reconcile writes the pair fact, so the next swap is judged with it.
    expect(r.entries[vk].fingerprint['set.coughVomitPair']).toBe(true);
  });

  it('a fold written without the set leaves the pair UNKNOWN, never off (so a swap cannot read as the pair forming)', () => {
    // The vomiting card folded while cough led, by a caller with no set in hand.
    const blind = foldedEntry(vomitCard, NOW);
    expect(blind.fingerprint).not.toHaveProperty('set.coughVomitPair');
    const r = reconcileFolds({ [vk]: blind }, vomitLeads, NOW);
    expect(r.entries[vk].state).toBe('folded');
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

  // CUL-826 — the two interleavings the pre-write re-check alone cannot close, each
  // driven through the real writer and the real clear (C-34: stub the READ, never the
  // rule). Each was run red against the single-bump / no-repair code before the fix.
  it('a write that STARTS after the clear began is caught too (the second bump) — the map cannot resurrect', async () => {
    // The write starts after the first bump, so it snapshots the already-bumped epoch,
    // reads the PRE-wipe blob, and its pre-write re-check compares EQUAL — under a
    // single bump it writes the previous account's map back after the clear resolved.
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    let releaseRemoval: () => void = () => {};
    const removalGate = new Promise<void>((r) => {
      releaseRemoval = r;
    });
    // Swapped by hand, not spied (the C-12 case's note: a restored spy over the mock's
    // own jest.fn leaves its storage inconsistent for the cases after it).
    const realRemove = AsyncStorage.removeItem.bind(AsyncStorage);
    let gatedOnce = false;
    (AsyncStorage as unknown as { removeItem: (k: string) => Promise<void> }).removeItem = async (k: string) => {
      if (gatedOnce) return realRemove(k);
      gatedOnce = true;
      await removalGate;
      return realRemove(k);
    };

    const clearing = clearSignalFold();
    // Starts now — after the first bump, before the removal has landed.
    const inFlight = writeFoldEntries('pet-b', { b: foldedEntry(reflection, NOW) });
    releaseRemoval();
    await clearing;
    await inFlight;
    (AsyncStorage as unknown as { removeItem: typeof realRemove }).removeItem = realRemove;

    expect(await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY)).toBeNull();
  });

  it('a clear whose removal lands between the re-check and the setItem is repaired after the write', async () => {
    // The removal is parked until the writer has passed its pre-write re-check and is
    // inside its `setItem`; the write then lands LAST. Only the post-write repair can
    // see this one, since every epoch check before the write was honestly equal.
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    const realSet = AsyncStorage.setItem.bind(AsyncStorage);
    let clearing: Promise<void> | null = null;
    (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem =
      async (k: string, v: string) => {
        if (clearing) return realSet(k, v);
        // The writer is past its re-check. Land the whole clear now, then the write.
        clearing = clearSignalFold();
        await clearing;
        return realSet(k, v);
      };

    await writeFoldEntries('pet-b', { b: foldedEntry(reflection, NOW) });
    (AsyncStorage as unknown as { setItem: typeof realSet }).setItem = realSet;
    expect(clearing).not.toBeNull();

    expect(await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY)).toBeNull();
    expect(await readFoldEntries('pet-a')).toEqual({});
  });

  it('a prune whose write lands after a clear is repaired the same way', async () => {
    await writeFoldEntries('pet-a', { a: foldedEntry(postprandial, NOW) });
    await writeFoldEntries('pet-gone', { g: foldedEntry(reflection, NOW) });
    const realSet = AsyncStorage.setItem.bind(AsyncStorage);
    let clearedOnce = false;
    (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem =
      async (k: string, v: string) => {
        if (clearedOnce) return realSet(k, v);
        clearedOnce = true;
        await clearSignalFold();
        return realSet(k, v);
      };

    await pruneFoldStore(['pet-a']);
    (AsyncStorage as unknown as { setItem: typeof realSet }).setItem = realSet;

    expect(await AsyncStorage.getItem(SIGNAL_FOLD_STORAGE_KEY)).toBeNull();
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

// v1.1-b (CUL-787): the chronicity `compare` (the counted 4-week halves, expand + phone
// script only) is NOT a §5.3 material-change field — a falling half is the window sliding,
// and a rising one already moves `episodeCount` ↑ / `daysSinceLastEpisode` ↓. Pinned here so a
// future edit to MATERIAL_FIELDS cannot make the compare a re-open trigger by accident.
describe('materialChange — the chronicity compare (CUL-787) never re-opens a fold', () => {
  const nyx = { halfDays: 28, recentCount: 2, priorCount: 12, recentLoggingDays: 27, priorLoggingDays: 28, comparable: true };
  it('a compare ARRIVING on a cached finding (the engine redeploy) is not a change', () => {
    const next: SymptomChronicityFinding = { ...chronicity, compare: nyx };
    expect(materialChange(foldFingerprint(chronicity), foldFingerprint(next))).toBeNull();
  });
  it('a compare MOVING in either direction, with nothing else changed, is not a change', () => {
    const base: SymptomChronicityFinding = { ...chronicity, compare: nyx };
    const fell: SymptomChronicityFinding = { ...chronicity, compare: { ...nyx, recentCount: 1, comparable: false } };
    const rose: SymptomChronicityFinding = { ...chronicity, compare: { ...nyx, recentCount: 14, priorCount: 0 } };
    expect(materialChange(foldFingerprint(base), foldFingerprint(fell))).toBeNull();
    expect(materialChange(foldFingerprint(base), foldFingerprint(rose))).toBeNull();
    expect(foldFingerprint(base)).not.toHaveProperty('compare');
  });
});
