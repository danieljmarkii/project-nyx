// The widget's props builders (PR W5) — the app-side half of the render
// contract. Pure functions, so these run against the real code, not a copy.

import {
  buildPetPanel,
  buildStatusRows,
  buildWidgetProps,
  buildWidgetTimeline,
  collectOutbox,
  contextLineFor,
  formatClock,
  slotKeyFor,
  type CulpritWidgetProps,
} from './widgetProps';
import type { WidgetSnapshot } from './widgetSnapshot';
import type { PetSlotIndex } from './widgetResolution';

const PET_A = '11111111-1111-4111-8111-111111111111';
const PET_B = '22222222-2222-4222-8222-222222222222';

function snapshot(overrides: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    schemaVersion: 1,
    petId: PET_A,
    petName: 'Biscuit',
    species: 'dog',
    generatedAt: '2026-07-24T17:00:00.000Z',
    dayKey: '2026-07-24',
    freeFed: false,
    bowlConfirmedAt: null,
    today: { mealCount: 1, treatCount: 0, lastMealAt: null, lastTreatAt: null },
    slots: [],
    mealChoices: [],
    treatChoices: [],
    trialDay: null,
    trialTargetDays: null,
    ...overrides,
  };
}

describe('formatClock', () => {
  it('renders the mock’s compact device-local form', () => {
    expect(formatClock(new Date(2026, 6, 24, 7, 42).toISOString())).toBe('7:42a');
    expect(formatClock(new Date(2026, 6, 24, 18, 0).toISOString())).toBe('6p');
    expect(formatClock(new Date(2026, 6, 24, 0, 5).toISOString())).toBe('12:05a');
    expect(formatClock(new Date(2026, 6, 24, 12, 0).toISOString())).toBe('12p');
  });

  it('is empty rather than "Invalid Date" on a bad stamp', () => {
    expect(formatClock('not-a-date')).toBe('');
  });
});

describe('contextLineFor', () => {
  it('leads with the trial — the wedge owner’s own countdown', () => {
    expect(contextLineFor(snapshot({ trialDay: 12, trialTargetDays: 28 }))).toBe('Day 12 of 28');
  });

  it('falls back to the arrangement shape, then to nothing', () => {
    expect(contextLineFor(snapshot({ freeFed: true }))).toBe('free-fed');
    expect(
      contextLineFor(
        snapshot({
          freeFed: true,
          slots: [{ label: 'Dinner', expectedWindow: '~7p', loggedAt: null }],
        }),
      ),
    ).toBe('free-fed + meals');
    expect(contextLineFor(snapshot())).toBe('');
  });
});

describe('buildStatusRows', () => {
  it('ticks a logged slot with its clock time and leaves the rest as gaps', () => {
    const loggedAt = new Date(2026, 6, 24, 7, 42).toISOString();
    const rows = buildStatusRows(
      snapshot({
        slots: [
          { label: 'Breakfast', expectedWindow: '~7a', loggedAt },
          { label: 'Dinner', expectedWindow: '~6p', loggedAt: null },
        ],
      }),
    );
    expect(rows[0]).toEqual({ label: 'Breakfast', done: true, when: '7:42a', expected: '~7a' });
    expect(rows[1]).toEqual({ label: 'Dinner', done: false, when: '', expected: '~6p' });
  });

  it('adds the bowl row for a free-fed component, ticked only when re-attested TODAY', () => {
    const today = buildStatusRows(
      snapshot({
        freeFed: true,
        dayKey: '2026-07-24',
        bowlConfirmedAt: new Date(2026, 6, 24, 8, 5).toISOString(),
      }),
    );
    expect(today).toEqual([
      { label: 'Bowl', done: true, when: 'topped 8:05a', expected: 'free-fed' },
    ]);

    // Yesterday's top-up is NOT today's ✓ — the bowl is an ambient fact again.
    const yesterday = buildStatusRows(
      snapshot({
        freeFed: true,
        dayKey: '2026-07-24',
        bowlConfirmedAt: new Date(2026, 6, 23, 8, 5).toISOString(),
      }),
    );
    expect(yesterday).toEqual([
      { label: 'Bowl', done: false, when: '', expected: 'free-fed' },
    ]);
  });

  it('never invents a bowl row for a meal-fed pet', () => {
    expect(buildStatusRows(snapshot({ bowlConfirmedAt: '2026-07-24T08:00:00.000Z' }))).toEqual([]);
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

  it('keys every bound pet by its slot so two widgets render two pets', () => {
    const props = buildWidgetProps({
      index,
      snapshots: [snapshot(), snapshot({ petId: PET_B, petName: 'Mochi', freeFed: true })],
      signedIn: true,
    });
    expect(Object.keys(props.pets).sort()).toEqual(['slot1', 'slot2']);
    expect(props.pets[slotKeyFor(1)].petId).toBe(PET_A);
    expect(props.pets[slotKeyFor(2)].petId).toBe(PET_B);
    expect(props.pets[slotKeyFor(2)].bowl).toBe(true);
  });

  it('carries a tombstoned slot as inactive with NO pet data (B-086)', () => {
    const props = buildWidgetProps({
      index: {
        schemaVersion: 1,
        assignments: [{ slot: 1, petId: PET_A, petName: 'Pixel', active: false }],
      },
      snapshots: [],
      signedIn: true,
    });
    const slot = props.pets.slot1;
    expect(slot.active).toBe(false);
    expect(slot.petName).toBe('Pixel');
    expect(slot).toMatchObject({ rows: [], mealChoices: [], treatChoices: [], contextLine: '' });
  });

  it('treats an assigned-but-unsnapshotted pet as inactive rather than half-rendered', () => {
    // The snapshot file is pruned before the index tombstones the pet; a slot
    // with no snapshot must never render a stale or empty "live" panel.
    const props = buildWidgetProps({ index, snapshots: [snapshot()], signedIn: true });
    expect(props.pets.slot1.active).toBe(true);
    expect(props.pets.slot2.active).toBe(false);
  });

  it('starts with an empty outbox and no UI state', () => {
    const props = buildWidgetProps({ index: null, snapshots: [], signedIn: false });
    expect(props).toMatchObject({ pets: {}, signedIn: false, ui: {}, pending: [], revoked: [] });
  });
});

describe('buildWidgetTimeline', () => {
  it('schedules the day rollover so a stale ✓ can never survive midnight', () => {
    const now = new Date(2026, 6, 24, 21, 30);
    const entries = buildWidgetTimeline(
      buildWidgetProps({ index: null, snapshots: [], signedIn: true }),
      now,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe(now);
    expect(entries[1].date.getTime()).toBe(new Date(2026, 6, 25).getTime());
    expect(entries[1].props).toBe(entries[0].props);
  });
});

describe('collectOutbox', () => {
  const capture = (id: string) => ({
    id,
    mealId: null,
    kind: 'bowl_topup' as const,
    petId: PET_A,
    foodItemId: null,
    occurredAt: '2026-07-24T17:00:00.000Z',
    label: 'Bowl topped up',
  });

  it('gathers captures across EVERY entry — a press lands in whichever was on screen', () => {
    const out = collectOutbox([
      { props: { pending: [capture('a')], revoked: [] } as Partial<CulpritWidgetProps> },
      { props: { pending: [capture('b')], revoked: ['z'] } as Partial<CulpritWidgetProps> },
    ]);
    expect(out.pending.map((p) => p.id)).toEqual(['a', 'b']);
    expect(out.revoked).toEqual(['z']);
  });

  it('dedupes by capture id so one tap can never apply twice', () => {
    const out = collectOutbox([
      { props: { pending: [capture('a')] } as Partial<CulpritWidgetProps> },
      { props: { pending: [capture('a')] } as Partial<CulpritWidgetProps> },
    ]);
    expect(out.pending).toHaveLength(1);
  });

  it('survives an entry with no props of ours', () => {
    expect(collectOutbox([{ props: {} }])).toEqual({ pending: [], revoked: [] });
  });
});

describe('buildPetPanel', () => {
  it('passes the resolution lib’s named choices through untouched (D2)', () => {
    const panel = buildPetPanel(
      3,
      true,
      'Biscuit',
      snapshot({
        mealChoices: [{ foodItemId: 'f1', label: "Dinner — Hill's z/d" }],
        treatChoices: [{ foodItemId: 't1', label: 'Dental chew' }],
      }),
    );
    expect(panel.slot).toBe(3);
    expect(panel.mealChoices).toEqual([
      { foodItemId: 'f1', label: "Dinner — Hill's z/d", kind: 'meal' },
    ]);
    expect(panel.treatChoices).toEqual([{ foodItemId: 't1', label: 'Dental chew', kind: 'treat' }]);
  });
});
