// CUL-1124 — History's dose row.
//
// Two defects, both code facts with no row on the real record to show them (every live
// dose is linked to a named item, 94 of 94 on 2026-09-24), so every fixture here is
// built for its case (C-35):
//   • the adherence chip rendered only inside the drug name's branch, so a dose with no
//     name showed no Given, Partial, Missed or Refused at all: a refused dose read
//     exactly like a given one;
//   • the name came only from the item cache, so a dose logged against a course typed
//     in by hand (no item) read "Medication" while the vet report named it.
//
// The ruling for a dose nothing names (PM, option (a), 2026-09-24): the row says only
// "Medication", never "no medicine named", because an item or course that has not yet
// reached this phone reads exactly like none.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// EventRow → lib/weight → lib/supabase, which fails fast at import when the env is
// unset. The row renders no weight here; the stub exists to satisfy the graph.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../store/petStore', () => {
  const pets = [{ id: 'pet-cat', name: 'Pixel', species: 'cat', sex: 'female' }];
  const state = { pets, activePet: pets[0] };
  return {
    usePetStore: Object.assign(
      (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
      { getState: () => state },
    ),
  };
});

import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { EventRow } from './EventRow';
import { theme } from '../../constants/theme';
import type { NyxEvent } from '../../store/eventStore';

const noop = () => {};

type Adherence = 'given' | 'partial' | 'missed' | 'refused';
type Node = { type: unknown; props: Record<string, any>; parent: Node | null };

/** A dose as the timeline read hands it over. Unnamed unless a test names it. */
function dose(over: Partial<NyxEvent> = {}): NyxEvent {
  return {
    id: 'dose-1',
    pet_id: 'pet-cat',
    event_type: 'medication',
    occurred_at: new Date(2026, 8, 21, 8, 2).toISOString(),
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: '',
    updated_at: '',
    medication_item_id: null,
    adherence: null,
    how_given: null,
    paired_event_id: null,
    paired_vehicle_intake: null,
    paired_food_name: null,
    drug_generic_name: null,
    drug_brand_name: null,
    regimen_drug_name: null,
    ...over,
  } as NyxEvent;
}

const byItem = { medication_item_id: 'item-1', drug_generic_name: 'Prednisolone' };
const byCourse = { regimen_drug_name: 'Metronidazole' };

function draw(event: NyxEvent) {
  return render(
    <EventRow event={event} isExpanded={false} onToggle={noop} onOpen={noop} onEdit={noop} onDelete={noop} />,
  );
}

/** The chip's touchable, found by walking UP from its label (AdherenceChipRow.test). */
function chipHost(label: Node): Node {
  let node: Node | null = label;
  while (node) {
    if (typeof node.type === 'string' && node.props.accessible) return node;
    node = node.parent;
  }
  throw new Error('no touchable above the chip label');
}
const fillOf = (label: Node) => StyleSheet.flatten(chipHost(label).props.style).backgroundColor;

const LABEL: Record<Adherence, string> = {
  given: 'Given', partial: 'Partial', missed: 'Missed', refused: 'Refused',
};
// Given in the accent; every state short of it in the symptom rose (AdherenceChipRow's
// CONCERN set). Restated here on purpose: this suite pins what the row SHOWS, and a
// change to either colour is a clinical call that should have to change this line.
const FILL: Record<Adherence, string> = {
  given: theme.colorAccent,
  partial: theme.colorEventSymptom,
  missed: theme.colorEventSymptom,
  refused: theme.colorEventSymptom,
};

describe.each([
  ['named by its item', byItem, 'Prednisolone'],
  ['named by its course', byCourse, 'Metronidazole'],
  ['named by nothing', {}, null],
] as const)('a dose %s', (_case, naming, name) => {
  it.each(Object.keys(LABEL) as Adherence[])('shows its %s chip, in its colour', (adherence) => {
    const { getByText, queryByText } = draw(dose({ ...naming, adherence }));
    const label = getByText(LABEL[adherence]) as unknown as Node;
    expect(fillOf(label)).toBe(FILL[adherence]);
    // One chip, the dose's own: no other state is drawn beside it.
    for (const other of Object.values(LABEL).filter((l) => l !== LABEL[adherence])) {
      expect(queryByText(other)).toBeNull();
    }
    if (name) expect(getByText(name)).toBeTruthy();
  });

  it('shows no chip while the dose is unrated', () => {
    const { queryByText } = draw(dose({ ...naming, adherence: null }));
    for (const l of Object.values(LABEL)) expect(queryByText(l)).toBeNull();
    expect(queryByText('Unconfirmed')).toBeNull();
  });

  it('shows Unconfirmed, not a chip, on a combo dose whose vehicle was left and nobody answered', () => {
    const { getByText, queryByText } = draw(dose({
      ...naming,
      adherence: null,
      paired_event_id: 'meal-1',
      paired_vehicle_intake: 'refused',
      paired_food_name: 'Churu',
    }));
    expect(getByText('Unconfirmed')).toBeTruthy();
    for (const l of Object.values(LABEL)) expect(queryByText(l)).toBeNull();
  });

  it('shows the answer, not Unconfirmed, once the owner said what happened to that dose', () => {
    const { getByText, queryByText } = draw(dose({
      ...naming,
      adherence: 'refused',
      paired_event_id: 'meal-1',
      paired_vehicle_intake: 'refused',
      paired_food_name: 'Churu',
    }));
    expect(getByText('Refused')).toBeTruthy();
    expect(queryByText('Unconfirmed')).toBeNull();
  });
});

describe('the name a dose row gives its drug', () => {
  it('the item comes before the course', () => {
    const { getByText, queryByText } = draw(dose({
      medication_item_id: 'item-1',
      drug_generic_name: 'Cetirizine HCl',
      drug_brand_name: 'Zyrtec',
      regimen_drug_name: 'Cetirizine',
      adherence: 'given',
    }));
    expect(getByText('Cetirizine HCl · Zyrtec')).toBeTruthy();
    expect(queryByText('Cetirizine')).toBeNull();
  });

  it('a course typed in by hand names every one of its doses', () => {
    const { getByText } = draw(dose({ ...byCourse, adherence: 'given' }));
    expect(getByText('Metronidazole')).toBeTruthy();
  });

  it('a blank course name is no name: the row reads as unnamed, chip and all', () => {
    const { queryByText, getByText } = draw(dose({ regimen_drug_name: '   ', adherence: 'missed' }));
    expect(getByText('Medication')).toBeTruthy();
    expect(getByText('Missed')).toBeTruthy();
    expect(queryByText(/no medicine/i)).toBeNull();
  });

  // The ruling (a): a dose nothing names says only what it is. "No medicine named"
  // would be false while its item or its course is still on the way to this phone.
  it('a dose nothing names claims nothing about its name', () => {
    const { queryByText, getByText } = draw(dose({ adherence: 'refused' }));
    expect(getByText('Medication')).toBeTruthy();
    expect(queryByText(/no medicine/i)).toBeNull();
    expect(queryByText(/unnamed|unknown/i)).toBeNull();
  });
});

describe('the chip is read-only, and a value this build does not know reads as unrated', () => {
  it('the chip lets a tap fall through to the row', () => {
    const { getByText } = draw(dose({ adherence: 'refused' }));
    let node: Node | null = getByText('Refused') as unknown as Node;
    let passesThrough = false;
    while (node) {
      if (node.props.pointerEvents === 'none') { passesThrough = true; break; }
      node = node.parent;
    }
    expect(passesThrough).toBe(true);
  });

  it('an adherence value this build does not know draws no chip, and does not throw', () => {
    const { getByText, queryByText } = draw(
      dose({ ...byItem, adherence: 'spat_out' as unknown as Adherence }),
    );
    expect(getByText('Prednisolone')).toBeTruthy();
    for (const l of Object.values(LABEL)) expect(queryByText(l)).toBeNull();
  });

  // The adversarial pass on this PR: doubt was decided on the RAW value while the chip
  // read the narrowed one, so this dose drew nothing at all, while the record screen,
  // which narrows first, marked it in doubt. Migration 020 names the value this is for
  // (S1 may add `vomited_up`), and an older build would meet it on the next sync.
  it('a value this build does not know, on a combo whose meal was refused, reads Unconfirmed like the record', () => {
    const { getByText, queryByText } = draw(dose({
      ...byItem,
      adherence: 'vomited_up' as unknown as Adherence,
      paired_event_id: 'meal-1',
      paired_vehicle_intake: 'refused',
      paired_food_name: 'Churu',
    }));
    expect(getByText('Unconfirmed')).toBeTruthy();
    for (const l of Object.values(LABEL)) expect(queryByText(l)).toBeNull();
  });
});
