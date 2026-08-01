// The Home medication strip component (B-614 PR M2). These assert what the CARD
// renders — the pure state logic is `medStrip.test.ts`'s job — so models are built
// through the real `resolveMedStrips` (never hand-authored) so a component test can
// never drift from a shape the resolver cannot actually produce.
//
// M2 is CONTEXT-ONLY, so the load-bearing assertions here are: the day-progress bar
// binds to `progressFraction` and nothing else, a collapsed card is one line with
// no bar, a withholding fact renders in the concern colour (not a cheery coverage
// line), and NO confirm button renders yet (that is M3). The placement rule (§8/D9
// — below TrialStrip, above TodayZone) is a property of the Home screen, so it is
// asserted over the source at the bottom, the way `TrialStrip.test.tsx` does.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { fireEvent, render } from '@testing-library/react-native';
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

  it('renders NO confirm button — M2 is context-only (M3 adds the write)', () => {
    // Across every state that carries a confirm payload, the button is absent in M2.
    for (const input of [
      { regimens: [regimen()] }, // state 1 — confirm present on the model…
      { regimens: [regimen()], doses: [dose()] }, // state 2
    ] as Partial<MedStripInput>[]) {
      const m = model(input);
      expect(m.confirm).not.toBeNull(); // …the model DOES carry it,
      const tree = render(<MedStrip model={m} />);
      expect(tree.queryByText(/log dose/i)).toBeNull(); // …but the card does not draw it yet.
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
