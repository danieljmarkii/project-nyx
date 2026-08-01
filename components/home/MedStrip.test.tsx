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
// dose WITHOUT navigating (AC #9), it shows the optimistic "Dose logged just now" line
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
// Every test here injects `onConfirm`, so the real write never runs — mock the module
// to a no-op purely so the import chain resolves under jest.
jest.mock('../../lib/medicationDose', () => ({ insertMedicationDose: jest.fn() }));

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
    expect(tree.getByText('No dose logged yet today · usually 2×/day')).toBeTruthy();
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
    expect(tree.getByText('Amoxicillin · day 5 of 14 · 2 doses logged')).toBeTruthy();
    expect(tree.queryByTestId('med-strip-track')).toBeNull();
    // The count lives in the header; there is no separate fact line to render.
    expect(tree.queryByText(/logged today/)).toBeNull();
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
    expect(tree.getByText('Dose logged just now')).toBeTruthy(); // §9 state 10
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
      expect(tree.getByText('Dose logged just now')).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(tree.queryByText('Dose logged just now')).toBeNull();
      // The static model still carries a confirm payload (no reload in a unit test), so
      // the card returns to its live state and the button comes back.
      expect(tree.getByTestId('med-strip-confirm')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('resets to the live button and shows no optimistic line when the write fails', async () => {
    // A LOCAL write failure must never leave "Dose logged just now" on screen (that
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

      expect(tree.queryByText('Dose logged just now')).toBeNull();
      expect(tree.getByTestId('med-strip-confirm')).toBeTruthy();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('opens the Pet tab when tapped, and labels itself for a screen reader', () => {
    const onPress = jest.fn();
    const m = model({ regimens: [regimen()] });
    const tree = render(<MedStrip model={m} onPress={onPress} />);
    fireEvent.press(tree.getByTestId('med-strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.getByTestId('med-strip').props.accessibilityLabel).toBe(
      'Amoxicillin · day 5 of 14. No dose logged yet today · usually 2×/day. Open medications.',
    );
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
