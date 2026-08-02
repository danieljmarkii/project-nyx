// The widget's v2 props builders (Widget V2, PR 2) — the app-side half of the
// render contract. Pure functions, so these run against the real code, not a copy.

import {
  buildPetPanel,
  buildWidgetProps,
  buildWidgetTimeline,
  collectOutbox,
  contextLineFor,
  formatClock,
  slotKeyFor,
  type V1OutboxProps,
} from './widgetProps';
import type { WidgetSnapshot } from './widgetSnapshot';
import type { WidgetClassFacts, WidgetTodayByClass, WidgetTrialSnapshot } from './widgetSnapshotV2';
import type { PetSlotIndex } from './widgetResolution';

const PET_A = '11111111-1111-4111-8111-111111111111';
const PET_B = '22222222-2222-4222-8222-222222222222';

// Local-clock ISO instants (device zone is the widget's clock — B-514).
const at = (h: number, m = 0) => new Date(2026, 6, 24, h, m).toISOString();

function facts(count = 0, lastAt: string | null = null, names: string[] = [], times: string[] = []): WidgetClassFacts {
  return { count, lastAt, names, times };
}

function today(over: Partial<WidgetTodayByClass> = {}): WidgetTodayByClass {
  return {
    meals: facts(),
    treats: facts(),
    meds: { ...facts(), expectedToday: null },
    symptoms: { ...facts(), leadingType: null },
    ...over,
  };
}

function snapshot(overrides: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    schemaVersion: 1,
    petId: PET_A,
    petName: 'Biscuit',
    species: 'dog',
    generatedAt: at(17),
    dayKey: '2026-07-24',
    freeFed: false,
    bowlConfirmedAt: null,
    today: { mealCount: 0, treatCount: 0, lastMealAt: null, lastTreatAt: null },
    slots: [],
    trialDay: null,
    trialTargetDays: null,
    todayByClass: today(),
    upNext: null,
    sevenDays: [],
    trial: null,
    ...overrides,
  };
}

describe('formatClock', () => {
  it('renders the mock’s compact device-local form', () => {
    expect(formatClock(at(7, 42))).toBe('7:42a');
    expect(formatClock(at(18, 0))).toBe('6p');
    expect(formatClock(at(0, 5))).toBe('12:05a');
    expect(formatClock(at(12, 0))).toBe('12p');
  });

  it('is empty rather than "Invalid Date" on a bad stamp', () => {
    expect(formatClock('not-a-date')).toBe('');
  });
});

describe('contextLineFor', () => {
  it('leads with the trial — the wedge owner’s own countdown', () => {
    expect(contextLineFor(snapshot({ trialDay: 12, trialTargetDays: 28 }))).toBe('Day 12 of 28');
  });

  // The widget may not render a countdown that contradicts itself, and may not
  // disagree with the trial card about the same trial on the same unlock.
  it('never renders "Day N of M" past the window', () => {
    expect(contextLineFor(snapshot({ trialDay: 61, trialTargetDays: 56 }))).toBe('Day 61 · 5d past');
    expect(contextLineFor(snapshot({ trialDay: 56, trialTargetDays: 56 }))).toBe('Day 56 of 56');
  });

  it('falls back to the arrangement shape, then to nothing', () => {
    expect(contextLineFor(snapshot({ freeFed: true }))).toBe('free-fed');
    expect(
      contextLineFor(
        snapshot({ freeFed: true, slots: [{ label: 'Dinner', expectedWindow: '~7p', loggedAt: null }] }),
      ),
    ).toBe('free-fed + meals');
    expect(contextLineFor(snapshot())).toBe('');
  });
});

describe('buildPetPanel — the tiles (§2.3)', () => {
  const panelFor = (t: WidgetTodayByClass, extra: Partial<WidgetSnapshot> = {}) =>
    buildPetPanel(1, true, 'Biscuit', snapshot({ todayByClass: t, ...extra }));

  it('builds a meal tile: count + recency, sub = the food name', () => {
    const p = panelFor(today({ meals: facts(1, at(7, 42), ["Hill's z/d"], [at(7, 42)]) }));
    expect(p.classTiles).toContainEqual({
      kind: 'meal',
      label: 'Meals',
      value: '1',
      unit: '· 7:42a',
      sub: "Hill's z/d",
    });
  });

  it('a 2+ meal count reads "· last <time>"', () => {
    const p = panelFor(today({ meals: facts(2, at(17, 12), ["Hill's z/d"], [at(17, 12), at(7, 42)]) }));
    expect(p.classTiles[0].unit).toBe('· last 5:12p');
  });

  it('shows a med denominator ONLY when the cadence is known (B-614), else count + time', () => {
    const known = panelFor(today({ meds: { ...facts(1, at(8), ['Amoxicillin'], [at(8)]), expectedToday: 2 } }));
    expect(known.classTiles).toContainEqual({
      kind: 'med',
      label: 'Meds',
      value: '1',
      unit: 'of 2 today',
      sub: 'Amoxicillin · 8a',
    });
    const unknown = panelFor(today({ meds: { ...facts(2, at(18, 15), ['Gabapentin'], [at(18, 15), at(8)]), expectedToday: null } }));
    expect(unknown.classTiles).toContainEqual({
      kind: 'med',
      label: 'Meds',
      value: '2',
      unit: '· last 6:15p',
      sub: 'Gabapentin',
    });
  });

  it('names the AGGREGATE honestly when the count spans two drugs (no cross-med fabrication)', () => {
    // Two meds, one dose each — "2 · Drug B" would read as two of Drug B (N2). The
    // sub joins the distinct drug identities instead, mirroring the meal tile.
    const p = panelFor(
      today({ meds: { ...facts(2, at(14), ['Gabapentin', 'Amoxicillin'], [at(14), at(8)]), expectedToday: null } }),
    );
    expect(p.classTiles[0]).toMatchObject({ kind: 'med', value: '2', sub: 'Gabapentin, Amoxicillin' });
  });

  it('a single symptom type is the label; the value counts it, the sub carries the times', () => {
    const p = panelFor(
      today({ symptoms: { ...facts(2, at(16, 40), ['Vomiting', 'Vomiting'], [at(16, 40), at(14, 14)]), leadingType: 'Vomiting' } }),
    );
    expect(p.classTiles[0]).toEqual({
      kind: 'symptom',
      label: 'Vomiting',
      value: '×2',
      unit: '· last 4:40p',
      sub: '2:14p · 4:40p',
    });
  });

  it('mixed symptom types lead by COUNT (not recency); the total goes in the sub (§2.3 ①)', () => {
    // The MOST RECENT symptom is the single itch (3p), but vomiting has the higher
    // count (×2) — the safety lead must foreground vomiting, not the recent itch.
    const p = panelFor(
      today({ symptoms: { ...facts(3, at(15, 0), ['Itching', 'Vomiting', 'Vomiting'], [at(15, 0), at(14, 0), at(9, 0)]), leadingType: 'Itching' } }),
    );
    expect(p.classTiles[0]).toMatchObject({ kind: 'symptom', label: 'Vomiting', value: '×2', sub: '3 symptoms today' });
  });

  it('breaks a symptom-count tie toward the most recent type', () => {
    // One vomit (2p), one itch (3p), equal counts — the more recent (itch) leads.
    const p = panelFor(
      today({ symptoms: { ...facts(2, at(15, 0), ['Itching', 'Vomiting'], [at(15, 0), at(14, 0)]), leadingType: 'Itching' } }),
    );
    expect(p.classTiles[0]).toMatchObject({ kind: 'symptom', label: 'Itching', value: '×1', sub: '2 symptoms today' });
  });

  it('never renders a bare "Symptom ×0" if the leading type is somehow null', () => {
    // Defensive: a hand-built facts with count>0 and a null leadingType still names
    // a real logged type (the single-type branch reads types[0]), never "×0".
    const p = panelFor(today({ symptoms: { ...facts(2, at(16), ['Vomiting', 'Vomiting'], [at(16), at(9)]), leadingType: null } }));
    expect(p.classTiles[0]).toMatchObject({ kind: 'symptom', label: 'Vomiting', value: '×2' });
  });

  it('orders the class tiles symptom → meal → med → treat, symptom always first (Principle 3)', () => {
    const p = panelFor(
      today({
        meals: facts(1, at(7), ['Kibble'], [at(7)]),
        treats: facts(1, at(15), ['Chew'], [at(15)]),
        meds: { ...facts(1, at(8), ['Amoxicillin'], [at(8)]), expectedToday: 1 },
        symptoms: { ...facts(1, at(16), ['Vomiting'], [at(16)]), leadingType: 'Vomiting' },
      }),
    );
    expect(p.classTiles.map((t) => t.kind)).toEqual(['symptom', 'meal', 'med', 'treat']);
  });

  it('gates a tile on a logged fact — a class with nothing today contributes no tile', () => {
    const p = panelFor(today({ meals: facts(1, at(7), ['Kibble'], [at(7)]) }));
    expect(p.classTiles.map((t) => t.kind)).toEqual(['meal']);
    expect(p.hasTodayEvents).toBe(true);
  });

  it('hasTodayEvents is false when every class is empty', () => {
    expect(panelFor(today()).hasTodayEvents).toBe(false);
  });

  it('carries the up-next facts and the trial-record tile from the v2 block', () => {
    const p = panelFor(today(), {
      upNext: { label: 'Dinner', approxTime: '~5p' },
      trial: trial({ daysLogged: 12, daysElapsed: 12 }),
    });
    expect(p.upNext).toEqual({ label: 'Dinner', approxTime: '~5p' });
    expect(p.trialRecord).toEqual({
      kind: 'trialRecord',
      label: 'Trial record',
      value: '12',
      unit: 'of 12 days',
      sub: 'every day logged so far',
    });
  });

  it('the trial-record sub is a record fact, never praise, when the record has gaps', () => {
    const p = panelFor(today(), { trial: trial({ daysLogged: 8, daysElapsed: 12 }) });
    expect(p.trialRecord?.sub).toBe('record of the trial so far');
  });
});

function trial(over: Partial<WidgetTrialSnapshot> = {}): WidgetTrialSnapshot {
  return {
    day: 12,
    target: 28,
    daysLogged: 12,
    daysElapsed: 12,
    stripDays: Array.from({ length: over.daysElapsed ?? 12 }, () => ({ logged: true })),
    ...over,
  };
}

describe('buildPetPanel — the ground band (§2.5)', () => {
  it('renders the trial strip while a trial runs, caption totalling the whole trial', () => {
    const t = trial({ daysLogged: 11, daysElapsed: 12, stripDays: Array.from({ length: 12 }, (_, i) => ({ logged: i !== 4 })) });
    const band = buildPetPanel(1, true, 'Biscuit', snapshot({ trial: t })).band;
    expect(band?.type).toBe('trial');
    if (band?.type === 'trial') {
      expect(band.dots).toHaveLength(12);
      expect(band.todayDotIndex).toBe(11);
      expect(band.caption).toBe('11 of 12 trial days logged');
    }
  });

  it('caps the strip at the most recent 14 dots but totals the whole trial in the caption', () => {
    const t = trial({ daysLogged: 18, daysElapsed: 20, stripDays: Array.from({ length: 20 }, () => ({ logged: true })) });
    const band = buildPetPanel(1, true, 'Biscuit', snapshot({ trial: t })).band;
    if (band?.type === 'trial') {
      expect(band.dots).toHaveLength(14);
      expect(band.todayDotIndex).toBe(13);
      expect(band.caption).toBe('18 of 20 trial days logged'); // caption never clips
    }
  });

  it('otherwise renders the 7-day pips', () => {
    const band = buildPetPanel(
      1,
      true,
      'Biscuit',
      snapshot({ sevenDays: [{ dayKey: '2026-07-24', logged: true, symptomLogged: true }] }),
    ).band;
    expect(band).toEqual({ type: 'pips', days: [{ logged: true, symptomLogged: true }], caption: 'last 7 days' });
  });

  it('is null (Log-chip-only band) when there is neither a trial nor a coverage row', () => {
    expect(buildPetPanel(1, true, 'Biscuit', snapshot({ sevenDays: [] })).band).toBeNull();
  });
});

describe('buildWidgetProps', () => {
  const index: PetSlotIndex = {
    schemaVersion: 1,
    assignments: [
      { slot: 1, petId: PET_A, petName: 'Biscuit', active: true },
      { slot: 2, petId: PET_B, petName: 'Mochi', active: true },
    ],
  };

  it('keys every bound pet by its slot so two widgets render two pets, at schema 2', () => {
    const props = buildWidgetProps({
      index,
      snapshots: [snapshot(), snapshot({ petId: PET_B, petName: 'Mochi' })],
      signedIn: true,
    });
    expect(props.schemaVersion).toBe(2);
    expect(Object.keys(props.pets).sort()).toEqual(['slot1', 'slot2']);
    expect(props.pets[slotKeyFor(2)].petId).toBe(PET_B);
    // No outbox in the v2 contract.
    expect(props).not.toHaveProperty('ui');
    expect(props).not.toHaveProperty('pending');
  });

  it('carries a tombstoned slot as inactive with NO facts (B-086)', () => {
    const props = buildWidgetProps({
      index: { schemaVersion: 1, assignments: [{ slot: 1, petId: PET_A, petName: 'Pixel', active: false }] },
      snapshots: [],
      signedIn: true,
    });
    const slot = props.pets.slot1;
    expect(slot.active).toBe(false);
    expect(slot.petName).toBe('Pixel');
    expect(slot).toMatchObject({ classTiles: [], upNext: null, trialRecord: null, band: null, contextLine: '' });
  });

  it('treats an assigned-but-unsnapshotted pet as inactive rather than half-rendered', () => {
    const props = buildWidgetProps({ index, snapshots: [snapshot()], signedIn: true });
    expect(props.pets.slot1.active).toBe(true);
    expect(props.pets.slot2.active).toBe(false);
  });
});

describe('buildWidgetTimeline', () => {
  it('schedules the day rollover so a stale count can never survive midnight', () => {
    const now = new Date(2026, 6, 24, 21, 30);
    const entries = buildWidgetTimeline(buildWidgetProps({ index: null, snapshots: [], signedIn: true }), now);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe(now);
    expect(entries[1].date.getTime()).toBe(new Date(2026, 6, 25).getTime());
    expect(entries[1].props).toBe(entries[0].props);
  });
});

describe('collectOutbox (the §3 v1 residual-drain reader)', () => {
  const capture = (id: string) => ({
    id,
    mealId: null,
    kind: 'bowl_topup' as const,
    petId: PET_A,
    foodItemId: null,
    occurredAt: at(17),
    label: 'Bowl topped up',
  });

  it('gathers v1 captures across every stored entry', () => {
    const out = collectOutbox([
      { props: { pending: [capture('a')], revoked: [] } as V1OutboxProps },
      { props: { pending: [capture('b')], revoked: ['z'] } as V1OutboxProps },
    ]);
    expect(out.pending.map((p) => p.id)).toEqual(['a', 'b']);
    expect(out.revoked).toEqual(['z']);
  });

  it('dedupes by capture id so one tap can never apply twice', () => {
    const out = collectOutbox([
      { props: { pending: [capture('a')] } as V1OutboxProps },
      { props: { pending: [capture('a')] } as V1OutboxProps },
    ]);
    expect(out.pending).toHaveLength(1);
  });

  it('finds nothing in a v2 entry (no outbox in the contract)', () => {
    expect(collectOutbox([{ props: {} }])).toEqual({ pending: [], revoked: [] });
  });
});
