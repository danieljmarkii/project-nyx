// The Home medication strip component (B-614 PR M2 + M3). These assert what the CARD
// renders — the pure state logic is `medStrip.test.ts`'s job — so models are built
// through the real `resolveMedStrips` (never hand-authored) so a component test can
// never drift from a shape the resolver cannot actually produce.
//
// The M2 (context) assertions are: the day-progress bar binds to `progressFraction`
// and nothing else, a collapsed card is one line with no bar, and a withholding fact
// renders in the concern colour (not a cheery coverage line). The M3 (write)
// assertions are the one-tap confirm (§5 + §9 state 10): the "Log dose" button
// renders iff the resolver supplied a confirm payload, tapping it confirms exactly one
// dose WITHOUT navigating (AC #9), it shows the optimistic "{drug} · logged just now" line
// and then settles. The placement rule (§8/D9 — below TrialStrip, above TodayZone) is
// a property of the Home screen, so it is asserted over the source at the bottom, the
// way `TrialStrip.test.tsx` does.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { MedStrip } from './MedStrip';
import { theme } from '../../constants/theme';
import {
  resolveMedStrips,
  type MedStripDoseRow,
  type MedStripInput,
  type MedStripItem,
  type MedStripModel,
  type MedStripRegimenRow,
} from '../../lib/medStrip';

// The component imports `insertMedicationDose` (→ lib/sync → lib/supabase, which
// fail-fasts on the unset test env, the house pattern VomitAnalysisSection.test uses).
// Most tests inject `onConfirm` so the real write never runs; the one default-path test
// below lets `performWrite` call this mock and asserts the payload it builds.
import { insertMedicationDose } from '../../lib/medicationDose';
jest.mock('../../lib/medicationDose', () => ({ insertMedicationDose: jest.fn() }));

// CUL-614 — the confirm now plays the §5.6 commit haptic. Mocked at the VERB, matching
// momentStore.test's convention: this suite asserts WHICH moment fires (and, more
// importantly, when it must not), while lib/haptics.test owns verb→pattern.
import { commitRoutine } from '../../lib/haptics';
jest.mock('../../lib/haptics', () => ({ commitRoutine: jest.fn() }));

// Mirror `medStrip.test.ts`: a fixed instant + explicit zone so day math is
// deterministic. NOW = 2026-07-31 18:00 UTC; a regimen started 2026-07-27 is day 5.
const NOW = Date.parse('2026-07-31T18:00:00.000Z');
const TZ = 'UTC';
const ITEM_AMOX = 'item-amox';
const ITEM_GABA = 'item-gaba';

const ITEMS: Record<string, MedStripItem> = {
  [ITEM_AMOX]: { generic_name: 'Amoxicillin', brand_name: null },
  [ITEM_GABA]: { generic_name: 'Gabapentin', brand_name: null },
};

function regimen(over: Partial<MedStripRegimenRow> = {}): MedStripRegimenRow {
  return {
    id: 'reg-amox',
    medication_item_id: ITEM_AMOX,
    drug_name: 'Amoxicillin',
    dose_amount: '250 mg',
    doses_per_day: 2,
    started_at: '2026-07-27',
    target_duration_days: 14,
    ...over,
  };
}

function dose(over: Partial<MedStripDoseRow> = {}): MedStripDoseRow {
  return {
    medication_id: null,
    medication_item_id: ITEM_AMOX,
    adherence: 'given',
    dose_amount: '250 mg',
    paired_event_id: null,
    paired_vehicle_intake: null,
    occurred_at: '2026-07-31T09:00:00.000Z',
    deleted_at: null,
    ...over,
  };
}

// The single model for one drug — the resolver returns an array; the component
// renders one member, so every test pulls index 0 of a one-drug input.
function model(over: Partial<MedStripInput>): MedStripModel {
  const models = resolveMedStrips({
    petId: 'p1',
    regimens: [],
    doses: [],
    items: ITEMS,
    nowMs: NOW,
    timeZone: TZ,
    ...over,
  });
  expect(models.length).toBeGreaterThan(0);
  return models[0];
}

describe('MedStrip — context card', () => {
  it('renders the header and the coverage line (state 1)', () => {
    const tree = render(<MedStrip model={model({ regimens: [regimen()] })} />);
    expect(tree.getByText('Amoxicillin · day 5 of 14')).toBeTruthy();
    expect(tree.getByText('No dose logged yet today · usually twice a day')).toBeTruthy();
    // The tap affordance is a chevron, same as the trial strip.
    expect(tree.getByText('›')).toBeTruthy();
  });

  it('binds the bar to day progress — logging a dose never moves it (N2)', () => {
    const widthOf = (m: MedStripModel) => {
      const tree = render(<MedStrip model={m} />);
      const flat = StyleSheet.flatten(tree.getByTestId('med-strip-fill').props.style) as {
        width: string;
      };
      return Number(flat.width.replace('%', ''));
    };
    // Same day, one dose logged vs none — identical bar (day 5 of 14).
    expect(widthOf(model({ regimens: [regimen()] }))).toBeCloseTo((5 / 14) * 100, 6);
    expect(widthOf(model({ regimens: [regimen()], doses: [dose()] }))).toBeCloseTo(
      (5 / 14) * 100,
      6,
    );
  });

  it('draws no bar for an ongoing med (no honest denominator)', () => {
    const m = model({
      regimens: [
        regimen({
          id: 'reg-gaba',
          medication_item_id: ITEM_GABA,
          drug_name: 'Gabapentin',
          doses_per_day: 1,
          target_duration_days: null,
        }),
      ],
    });
    const tree = render(<MedStrip model={m} />);
    expect(tree.getByText('Gabapentin · ongoing')).toBeTruthy();
    expect(tree.queryByTestId('med-strip-track')).toBeNull();
  });

  it('a collapsed card is one line: header only, no bar, no fact line (state 3)', () => {
    // 2 of 2 doses today → covered → collapsed.
    const m = model({ regimens: [regimen()], doses: [dose(), dose()] });
    expect(m.collapsed).toBe(true);
    const tree = render(<MedStrip model={m} />);
    expect(tree.getByText('Amoxicillin · day 5 of 14 · 2 doses logged today')).toBeTruthy();
    expect(tree.queryByTestId('med-strip-track')).toBeNull();
    // "logged today" (M5 legibility) lives IN the header only — there is no separate
    // coverage/fact line under a collapsed card, so it appears exactly once.
    expect(tree.getAllByText(/logged today/)).toHaveLength(1);
  });

  it('renders a withholding fact in the concern colour, not a coverage line (N3, state 8)', () => {
    const m = model({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })] });
    const tree = render(<MedStrip model={m} />);
    const line = tree.getByText(m.line!);
    const flat = StyleSheet.flatten(line.props.style) as { color: string };
    expect(flat.color).toBe(theme.colorEventSymptom);
    // Never the tidy coverage line over a refusal.
    expect(tree.queryByText(/logged today/)).toBeNull();
  });

  // CUL-614 — the confirmed line now NAMES the record (§5's sentence rule) instead of
  // a drug-agnostic "Dose logged just now". Derived from the model here rather than
  // written as a literal, so the assertions state the RULE ("it names this card's
  // drug") and a fixture rename cannot leave them quietly asserting the wrong card's
  // name — which is precisely the multi-med confusion the copy change exists to fix.
  const confirmed = (m: { drugName: string }) => `${m.drugName} · logged just now`;

  it('the coverage line is NOT the concern colour', () => {
    const m = model({ regimens: [regimen()] });
    const line = render(<MedStrip model={m} />).getByText(m.line!);
    const flat = StyleSheet.flatten(line.props.style) as { color: string };
    expect(flat.color).toBe(theme.colorTextSecondary);
  });

  it('renders the "Log dose" button when the model carries a confirm payload (M3, state 1/2)', () => {
    for (const input of [
      { regimens: [regimen()] }, // state 1 — course open today
      { regimens: [regimen()], doses: [dose()] }, // state 2 — partly covered
    ] as Partial<MedStripInput>[]) {
      const m = model(input);
      expect(m.confirm).not.toBeNull();
      const tree = render(<MedStrip model={m} />);
      expect(tree.getByTestId('med-strip-confirm')).toBeTruthy();
      expect(tree.getByText('Log dose')).toBeTruthy();
    }
  });

  it('renders NO button when the confirm payload is null (withholding §6, collapsed §7, AC #5/#6/#7)', () => {
    // A refused dose in the window → withholding → the confirm stands down (§6).
    const withholding = model({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })] });
    expect(withholding.confirm).toBeNull();
    expect(render(<MedStrip model={withholding} />).queryByTestId('med-strip-confirm')).toBeNull();

    // Cadence covered today (2 of 2) → collapsed → no button (§7).
    const collapsed = model({ regimens: [regimen()], doses: [dose(), dose()] });
    expect(collapsed.confirm).toBeNull();
    expect(render(<MedStrip model={collapsed} />).queryByTestId('med-strip-confirm')).toBeNull();
  });

  it('the button confirms one dose and shows the optimistic line, without navigating (state 10, AC #9)', async () => {
    // Inject `onConfirm` (mirrors `onPress`) so the state machine is exercised without
    // the DB/store/sync; `onPress` is injected too, to prove the write never navigates.
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onPress = jest.fn();
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onConfirm={onConfirm} onPress={onPress} />);

    await act(async () => {
      fireEvent.press(tree.getByTestId('med-strip-confirm'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled(); // tapping the button never opens the Pet tab
    expect(tree.getByText(confirmed(m))).toBeTruthy(); // §9 state 10
    // While confirmed the button stands down — no button beside the "just logged" line.
    expect(tree.queryByTestId('med-strip-confirm')).toBeNull();
  });

  it('stands the button down the instant the write starts, so one tap = one dose (AC #9)', async () => {
    // A deferred promise holds the write in flight, so the assertions land while the
    // component is in its 'submitting' phase — the button is gone, so there is no
    // second tap to make.
    let resolveWrite!: () => void;
    const onConfirm = jest.fn(() => new Promise<void>((r) => (resolveWrite = r)));
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);

    fireEvent.press(tree.getByTestId('med-strip-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(tree.queryByTestId('med-strip-confirm')).toBeNull();

    await act(async () => {
      resolveWrite();
    });
  });

  it('settles out of the optimistic line after the dwell (state 10 → 2/3)', async () => {
    jest.useFakeTimers();
    try {
      const onConfirm = jest.fn().mockResolvedValue(undefined);
      const m = model({ regimens: [regimen()] });
      const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);

      await act(async () => {
        fireEvent.press(tree.getByTestId('med-strip-confirm'));
      });
      expect(tree.getByText(confirmed(m))).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(tree.queryByText(confirmed(m))).toBeNull();
      // The static model still carries a confirm payload (no reload in a unit test), so
      // the card returns to its live state and the button comes back.
      expect(tree.getByTestId('med-strip-confirm')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the DEFAULT write path logs a given dose with the confirm payload (petId from the model)', async () => {
    // No `onConfirm` → the real `performWrite` runs (the production path the injected
    // tests bypass). This is the one place the write payload — including the petId bound
    // to the loaded pet, NOT a live active-pet read (the cross-pet-write guard) — is
    // asserted end to end.
    const mockInsert = insertMedicationDose as jest.Mock;
    mockInsert.mockClear();
    mockInsert.mockResolvedValue({
      eventId: 'e',
      administrationId: 'a',
      occurredAtIso: '2026-07-31T18:00:00.000Z',
      now: '2026-07-31T18:00:00.000Z',
    });
    const m = model({ regimens: [regimen()] }); // confirm carries petId 'p1'
    const tree = render(<MedStrip model={m} />);

    await act(async () => {
      fireEvent.press(tree.getByTestId('med-strip-confirm'));
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: 'p1',
        medicationItemId: ITEM_AMOX,
        medicationId: 'reg-amox',
        adherence: 'given',
        doseAmount: '250 mg',
      }),
    );
    expect(tree.getByText(confirmed(m))).toBeTruthy();
  });

  it('resets to the live button and shows no optimistic line when the write fails', async () => {
    // A LOCAL write failure must never leave the confirmed line on screen (that
    // would claim a dose that was not recorded) and must return the button so the
    // owner can retry. The catch also alerts; console.error is silenced to keep the
    // run clean.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const onConfirm = jest.fn().mockRejectedValue(new Error('local write failed'));
      const m = model({ regimens: [regimen()] });
      const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);

      await act(async () => {
        fireEvent.press(tree.getByTestId('med-strip-confirm'));
      });

      expect(tree.queryByText(confirmed(m))).toBeNull();
      expect(tree.getByTestId('med-strip-confirm')).toBeTruthy();
    } finally {
      errSpy.mockRestore();
    }
  });

  // ── CUL-614: the confirm joins the R2 register (sentence + mark + haptic) ──────
  it('plays the ROUTINE commit haptic once the write lands (§5.6)', async () => {
    (commitRoutine as jest.Mock).mockClear();
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);

    await act(async () => {
      fireEvent.press(tree.getByTestId('med-strip-confirm'));
    });
    expect(commitRoutine).toHaveBeenCalledTimes(1);
  });

  it('stays SILENT when the write fails — a buzz would claim a dose that did not land', async () => {
    // The haptic fires after the write resolves, not on the tap: the failure path
    // returns before reaching it. The alternative — buzzing on press — would tell the
    // owner in the most physical way available that a dose was recorded, at the exact
    // moment it was not.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (commitRoutine as jest.Mock).mockClear();
    try {
      const onConfirm = jest.fn().mockRejectedValue(new Error('local write failed'));
      const m = model({ regimens: [regimen()] });
      const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);
      await act(async () => {
        fireEvent.press(tree.getByTestId('med-strip-confirm'));
      });
      expect(commitRoutine).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('no haptic is reachable from a withholding card, because no button renders there', () => {
    // D7's silence-on-safety, held STRUCTURALLY rather than by a rule in the component:
    // `resolveMedStrips` mints no confirm payload for a withholding record (§6), so the
    // only control that can play a haptic does not exist on a card carrying a refusal
    // fact. This is what lets MedStrip import lib/haptics at all — asserted here so a
    // future change that let the button render over a withholding card fails loudly
    // instead of quietly buzzing over bad news.
    const withholding = model({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })] });
    expect(withholding.confirm).toBeNull();
    const tree = render(<MedStrip model={withholding} />);
    expect(tree.queryByTestId('med-strip-confirm')).toBeNull();
  });

  it('shows the confirmation MARK only while the confirmed line is up', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onConfirm={onConfirm} />);
    // The mark is decorative (the line carries the meaning), so it is found by its
    // absence/presence in the tree rather than by an a11y label it deliberately lacks.
    const marks = () => tree.UNSAFE_root.findAllByProps({ accessibilityElementsHidden: true });
    expect(marks().length).toBe(0);
    await act(async () => {
      fireEvent.press(tree.getByTestId('med-strip-confirm'));
    });
    expect(tree.getByText(confirmed(m))).toBeTruthy();
    expect(marks().length).toBeGreaterThan(0);
  });

  it('opens the Pet tab when tapped, and labels itself for a screen reader', () => {
    const onPress = jest.fn();
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onPress={onPress} />);
    fireEvent.press(tree.getByTestId('med-strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.getByTestId('med-strip').props.accessibilityLabel).toBe(
      'Amoxicillin · day 5 of 14. No dose logged yet today · usually twice a day. Open medications.',
    );
  });
});

// ── M4 — the multi-med fold as a RENDERED SCREEN (§7 collapse + D8 ordering) ──────
// The resolver (M1) owns the collapse predicate and the D8 sort, and `medStrip.test.ts`
// pins them over the MODEL array. What M4 adds is the proof that the fold reads
// correctly as an actual screen: several cards, some collapsed, rendered in D8 order
// the way `app/(tabs)/index.tsx` renders them (`.map` over `resolveMedStrips`). These
// are the mock's §04 morning/evening frames — the same three meds before the day's
// doses are logged, and after — asserted as rendered output, not as model state.
describe('the multi-med fold — §7 collapse + D8 ordering on a real screen (M4)', () => {
  // Sam's cat (mock §04): a durationed course, an ongoing med, and an ad-hoc med.
  // Start dates are EXPLICIT so the D8 order — expanded before collapsed, then oldest
  // course first, then by name — is deterministic and asserted as the RULE, never the
  // mock's illustrative card layout (whose start dates are unspecified).
  const SCENE_ITEMS: Record<string, MedStripItem> = {
    'i-amox': { generic_name: 'Amoxicillin', brand_name: null },
    'i-gaba': { generic_name: 'Gabapentin', brand_name: null },
    'i-ceren': { generic_name: 'Cerenia', brand_name: null },
    'i-pred': { generic_name: 'Prednisolone', brand_name: null },
    'i-furo': { generic_name: 'Furosemide', brand_name: null },
  };

  // A durationed course (day 5 of 14 at NOW), 2×/day.
  const amox = (): MedStripRegimenRow => ({
    id: 'reg-amox',
    medication_item_id: 'i-amox',
    drug_name: 'Amoxicillin',
    dose_amount: '250 mg',
    doses_per_day: 2,
    started_at: '2026-07-27',
    target_duration_days: 14,
  });
  // An ongoing chronic med (no duration → no bar), 1×/day, started long before Amox so
  // it is the OLDER course and sorts first among expanded (and among collapsed).
  const gaba = (): MedStripRegimenRow => ({
    id: 'reg-gaba',
    medication_item_id: 'i-gaba',
    drug_name: 'Gabapentin',
    dose_amount: '100 mg',
    doses_per_day: 1,
    started_at: '2026-07-01',
    target_duration_days: null,
  });
  const doseFor = (item: string, over: Partial<MedStripDoseRow> = {}): MedStripDoseRow => ({
    medication_id: null,
    medication_item_id: item,
    adherence: 'given',
    dose_amount: null,
    paired_event_id: null,
    paired_vehicle_intake: null,
    occurred_at: '2026-07-31T09:00:00.000Z', // today (UTC)
    deleted_at: null,
    ...over,
  });
  // Cerenia's only dose is two days ago → an ad-hoc candidate that is never "covered"
  // (no cadence) and so never collapses, whatever its siblings do.
  const cerenAdhoc = () => doseFor('i-ceren', { occurred_at: '2026-07-29T15:00:00.000Z' });

  function scene(over: Partial<MedStripInput>): MedStripModel[] {
    return resolveMedStrips({
      petId: 'p1',
      regimens: [],
      doses: [],
      items: SCENE_ITEMS,
      nowMs: NOW,
      timeZone: TZ,
      ...over,
    });
  }
  // Render the array exactly as Home does — one keyed `<MedStrip>` per model — so the
  // rendered order under test IS the order the screen shows.
  function renderList(models: MedStripModel[]) {
    return render(
      <>
        {models.map((m) => (
          <MedStrip key={m.key} model={m} />
        ))}
      </>,
    );
  }
  // The rendered cards, top to bottom, by their accessibility label (which leads with
  // the header) — the readable proxy for "what order does the owner see?".
  const orderedLabels = (tree: ReturnType<typeof render>): string[] =>
    tree.getAllByTestId('med-strip').map((n) => n.props.accessibilityLabel as string);

  it('morning — nothing logged yet: every card expanded, oldest course first, ad-hoc last (D8)', () => {
    const models = scene({ regimens: [amox(), gaba()], doses: [cerenAdhoc()] });
    // Nothing is covered today, so nothing collapses.
    expect(models.every((m) => !m.collapsed)).toBe(true);

    const tree = renderList(models);
    const labels = orderedLabels(tree);
    expect(labels).toHaveLength(3);
    // D8 among expanded cards: oldest start first (Gabapentin 07-01 < Amoxicillin
    // 07-27), then the ad-hoc med (no start date) last.
    expect(labels[0]).toContain('Gabapentin');
    expect(labels[1]).toContain('Amoxicillin');
    expect(labels[2]).toContain('Cerenia');
    // Full dress: only the durationed course draws a day-progress bar; all three are
    // confirmable, so three buttons — this is the honest worst case the mock names.
    expect(tree.getAllByTestId('med-strip-track')).toHaveLength(1);
    expect(tree.getAllByTestId('med-strip-confirm')).toHaveLength(3);
  });

  it('evening — covered meds collapse to a header line, and the fold pays down (§7)', () => {
    const models = scene({
      regimens: [amox(), gaba()],
      doses: [
        cerenAdhoc(), // ad-hoc, no dose today → stays expanded
        doseFor('i-amox'),
        doseFor('i-amox'), // 2 of 2 today → covered → collapsed
        doseFor('i-gaba'), // 1 of 1 today → covered → collapsed
      ],
    });
    const tree = renderList(models);
    const labels = orderedLabels(tree);
    expect(labels).toHaveLength(3);
    // D8: the one expanded card (Cerenia) leads; then the collapsed group, oldest
    // first (Gabapentin 07-01 before Amoxicillin 07-27). A collapsed card sinks
    // because the record says today is handled — it does not get dropped.
    expect(labels[0]).toContain('Cerenia');
    expect(labels[1]).toContain('Gabapentin');
    expect(labels[2]).toContain('Amoxicillin');

    // The collapsed cards are one line: the count moved INTO the header, and both the
    // bar and the button are gone. That is the fold cost being paid down — three
    // buttons and a bar in the morning, one button and no bar now — without dropping
    // or re-ranking a single med.
    expect(tree.queryAllByTestId('med-strip-track')).toHaveLength(0);
    expect(tree.queryAllByTestId('med-strip-confirm')).toHaveLength(1); // Cerenia only
    expect(tree.getByText('Gabapentin · ongoing · 1 dose logged today')).toBeTruthy();
    expect(tree.getByText('Amoxicillin · day 5 of 14 · 2 doses logged today')).toBeTruthy();
    // N4 / M5 — the "logged today" count is a HEADER fact, never a separate cheery
    // coverage line under a collapsed card, so it appears exactly twice: once in each
    // collapsed header (Cerenia stays expanded and shows a recency line, not "today").
    expect(tree.getAllByText(/logged today/)).toHaveLength(2);
  });

  it('collapse is a state, never a cap — every med still renders however many collapse (D7)', () => {
    // Five distinct cadenced meds; three are covered today. A "show three, hide the
    // rest" cap would silently drop two — the exact failure D3 was ruled to prevent.
    const reg = (id: string, item: string, name: string, startedAt: string): MedStripRegimenRow => ({
      id,
      medication_item_id: item,
      drug_name: name,
      dose_amount: null,
      doses_per_day: 1,
      started_at: startedAt,
      target_duration_days: null,
    });
    const models = scene({
      regimens: [
        reg('r1', 'i-amox', 'Amoxicillin', '2026-07-20'),
        reg('r2', 'i-gaba', 'Gabapentin', '2026-07-21'),
        reg('r3', 'i-ceren', 'Cerenia', '2026-07-22'),
        reg('r4', 'i-pred', 'Prednisolone', '2026-07-23'),
        reg('r5', 'i-furo', 'Furosemide', '2026-07-24'),
      ],
      doses: [doseFor('i-amox'), doseFor('i-gaba'), doseFor('i-ceren')], // 3 covered → collapsed
    });
    expect(models.filter((m) => m.collapsed)).toHaveLength(3);

    const tree = renderList(models);
    // All five render — nothing capped away.
    expect(tree.getAllByTestId('med-strip')).toHaveLength(5);
    // The two still-open meds keep their buttons; the three covered ones stand down.
    expect(tree.getAllByTestId('med-strip-confirm')).toHaveLength(2);
    // Expanded-before-collapsed: the two uncovered meds lead, then the collapsed group.
    const labels = orderedLabels(tree);
    expect(labels[0]).toContain('Prednisolone'); // r4, uncovered, older of the two
    expect(labels[1]).toContain('Furosemide'); // r5, uncovered
    expect(labels.slice(2).every((l) => /dose logged/.test(l))).toBe(true); // collapsed tail
  });

  it('a no-cadence med never collapses, even beside collapsed siblings (§7 PRN row)', () => {
    // A PRN regimen (doses_per_day null) with three doses today is NOT "covered" — the
    // app cannot know a PRN med is done, and repeat dosing is the point. It must keep
    // its full dress while a cadenced sibling folds.
    const prn: MedStripRegimenRow = {
      id: 'reg-prn',
      medication_item_id: 'i-pred',
      drug_name: 'Prednisolone',
      dose_amount: null,
      doses_per_day: null,
      started_at: '2026-07-10',
      target_duration_days: null,
    };
    const models = scene({
      regimens: [amox(), prn],
      doses: [
        doseFor('i-amox'),
        doseFor('i-amox'), // Amox 2 of 2 → collapsed
        doseFor('i-pred'),
        doseFor('i-pred'),
        doseFor('i-pred'), // PRN, three today, still expanded
      ],
    });
    const byName = (n: string) => models.find((m) => m.drugName === n)!;
    expect(byName('Prednisolone').collapsed).toBe(false);
    expect(byName('Amoxicillin').collapsed).toBe(true);

    const tree = renderList(models);
    const labels = orderedLabels(tree);
    // Expanded-first: the PRN med leads, the collapsed course sinks below it.
    expect(labels[0]).toContain('Prednisolone');
    expect(labels[1]).toContain('Amoxicillin');
    // Only the PRN med keeps a button.
    expect(tree.getAllByTestId('med-strip-confirm')).toHaveLength(1);
  });
});

describe('placement on Home (§8/D9)', () => {
  it('sits below TrialStrip and above TodayZone', () => {
    const home = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
    const trial = home.indexOf('<TrialStrip');
    const med = home.indexOf('<MedStrip'); // the JSX usage, not the import
    const today = home.indexOf('<TodayZone />');
    // Assert the anchors exist first — `-1 < -1 < -1` would otherwise pass.
    expect(trial).toBeGreaterThan(-1);
    expect(med).toBeGreaterThan(-1);
    expect(today).toBeGreaterThan(-1);
    // D9: the diet trial is the wedge's primary object; a course is the shorter-
    // lived guest. Fixed order — neither can displace the other.
    expect(trial).toBeLessThan(med);
    expect(med).toBeLessThan(today);
  });
});
