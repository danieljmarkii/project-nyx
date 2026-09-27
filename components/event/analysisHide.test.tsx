// CUL-1323 — Hide and Show on the AI note are statements about the words on
// screen, on both incident sections. The race the adversarial pass found: the
// owner is looking at a calm read, a new Worth a call lands where this screen is
// not looking (a replaced photo, a second device), and a Hide on the stale card
// hid the escalation unseen. The write now matches the shown words
// (lib/analysisDismissal, unit-tested there); these pin what each section DOES
// with the answer. The writer is the one stub: `sameWords` and the copy are the
// real module (C-34), so the section's decision runs against the shipped rule.
let mockRow: Record<string, unknown> | null = null;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockRow, error: null }) }) }),
    }),
  },
}));
jest.mock('../../lib/analysisDismissal', () => ({
  ...jest.requireActual('../../lib/analysisDismissal'),
  writeAnalysisDismissal: jest.fn(),
}));
jest.mock('../../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  triggerStoolAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
  watchAnalysisRow: jest.fn(() => () => {}),
  saveVomitFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedFields: jest.fn(() => []),
  extractEditableFromPayload: jest.fn(() => null),
  normalizeVomitEdits: jest.fn((x: unknown) => x),
  saveStoolFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedStoolFields: jest.fn(() => []),
  extractStoolEditableFromPayload: jest.fn(() => null),
  normalizeStoolEdits: jest.fn((x: unknown) => x),
}));
jest.mock('./VomitFieldsEditor', () => ({ VomitFieldsEditor: () => null }));
jest.mock('./StoolFieldsEditor', () => ({ StoolFieldsEditor: () => null }));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import { Alert } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import { VomitAnalysisSection } from './VomitAnalysisSection';
import { StoolAnalysisSection } from './StoolAnalysisSection';
import { INCIDENT_READ_HIDE_LABEL } from './IncidentReadCard';
import {
  writeAnalysisDismissal,
  READ_CHANGED_TITLE,
  READ_CHANGED_BODY,
  VOMIT_DISMISSAL_COLUMNS,
  STOOL_DISMISSAL_COLUMNS,
} from '../../lib/analysisDismissal';

const writer = writeAnalysisDismissal as jest.MockedFunction<typeof writeAnalysisDismissal>;

const CALM = { recommendation: 'monitor', read_text: 'Nothing obviously concerning in this one on its own.' };
const CALL = { recommendation: 'worth_a_call', read_text: 'There is blood in this one. Worth a call to your vet.' };

const SECTIONS = [
  {
    name: 'VomitAnalysisSection',
    Section: VomitAnalysisSection,
    newFinding: { blood_present: 'fresh_red' },
    base: {
      description: null, colour: null, contents: null, consistency: null, blood_present: null,
      bile_present: null, foreign_material_present: null, foreign_material_note: null,
    },
  },
  {
    name: 'StoolAnalysisSection',
    Section: StoolAnalysisSection,
    newFinding: { stool_blood_present: 'yes' },
    base: {
      description: null, stool_consistency: null, stool_colour: null, stool_content: null,
      stool_blood_present: null, stool_blood_type: null, stool_mucus_present: null,
      foreign_material_present: null, foreign_material_note: null,
    },
  },
] as const;

describe.each(SECTIONS)('$name — Hide and Show write only over the read on screen (CUL-1323)', ({ Section, base, newFinding }) => {
  const row = (over: Record<string, unknown>) => ({
    status: 'completed', ai_raw_payload: null, edited_at: null, dismissed_at: null, error: null,
    ...base, ...over,
  });
  let alert: jest.SpyInstance;

  beforeEach(() => {
    writer.mockReset();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    alert.mockClear();
  });
  afterEach(() => {
    mockRow = null;
    alert.mockRestore();
  });

  it('a Hide over unchanged words hides, carrying the words it was made on', async () => {
    mockRow = row(CALM);
    writer.mockResolvedValue('written');
    const { findByText, queryByText } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
    const hide = await findByText(INCIDENT_READ_HIDE_LABEL);
    await act(async () => { fireEvent.press(hide); });
    await act(async () => {});

    expect(writer).toHaveBeenCalledTimes(1);
    const [eventId, shown, iso] = writer.mock.calls[0];
    expect(eventId).toBe('e1');
    expect(shown).toMatchObject(CALM);
    expect(typeof iso).toBe('string');
    expect(await findByText('AI note hidden')).toBeTruthy();
    expect(queryByText(INCIDENT_READ_HIDE_LABEL)).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it('a Hide over a read that changed underneath hides NOTHING: the new Worth a call shows, and it is said', async () => {
    mockRow = row(CALM);
    const { findByText, queryByText, getByText } = render(<Section eventId="e2" petId="pet-1" petName="Rex" hasPhoto />);
    await findByText(INCIDENT_READ_HIDE_LABEL);
    // A new read lands where this screen is not looking. The record now holds it,
    // un-hidden (the server clears the hide on every new read).
    mockRow = row(CALL);
    writer.mockResolvedValue('read_changed');
    await act(async () => { fireEvent.press(getByText(INCIDENT_READ_HIDE_LABEL)); });
    await act(async () => {});

    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText('AI note hidden')).toBeNull();
    expect(queryByText(CALL.read_text)).toBeTruthy();
    expect(alert).toHaveBeenCalledWith(READ_CHANGED_TITLE, READ_CHANGED_BODY);
  });

  it('no row matched but the words are the same: a failure, rolled back and said, never "changed"', async () => {
    mockRow = row(CALM);
    const { findByText, queryByText, getByText } = render(<Section eventId="e3" petId="pet-1" petName="Rex" hasPhoto />);
    await findByText(INCIDENT_READ_HIDE_LABEL);
    writer.mockResolvedValue('read_changed');
    await act(async () => { fireEvent.press(getByText(INCIDENT_READ_HIDE_LABEL)); });
    await act(async () => {});

    expect(queryByText('AI note hidden')).toBeNull();
    expect(queryByText(CALM.read_text)).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Could not update', 'Try again in a moment.');
    expect(alert).not.toHaveBeenCalledWith(READ_CHANGED_TITLE, READ_CHANGED_BODY);
  });

  it('a Show on a hidden stale card shows the NEWER read, not the old words', async () => {
    mockRow = row({ ...CALM, dismissed_at: '2026-09-26T10:00:00.000Z' });
    const { findByText, queryByText, getByText } = render(<Section eventId="e4" petId="pet-1" petName="Rex" hasPhoto />);
    await findByText('AI note hidden');
    mockRow = row(CALL);
    writer.mockResolvedValue('read_changed');
    await act(async () => { fireEvent.press(getByText('Show')); });
    await act(async () => {});

    const [, shown, iso] = writer.mock.calls[0];
    expect(shown).toMatchObject(CALM);
    expect(iso).toBeNull();
    expect(await findByText('Worth a call')).toBeTruthy();
    expect(queryByText(CALM.read_text)).toBeNull();
    expect(alert).toHaveBeenCalledWith(READ_CHANGED_TITLE, READ_CHANGED_BODY);
  });

  it('the same words over a NEW red flag is a changed read: the stale Hide hides nothing (adversarial round 2)', async () => {
    // The contextual template leads the read text, so a replaced photo can add fresh
    // blood under byte-identical words, and Hide takes the observation grid off too.
    mockRow = row(CALL);
    const { findByText, queryByText, getByText } = render(<Section eventId="e6" petId="pet-1" petName="Rex" hasPhoto />);
    await findByText(INCIDENT_READ_HIDE_LABEL);
    mockRow = row({ ...CALL, ...newFinding });
    writer.mockResolvedValue('read_changed');
    await act(async () => { fireEvent.press(getByText(INCIDENT_READ_HIDE_LABEL)); });
    await act(async () => {});

    const [, shown] = writer.mock.calls[0];
    const [column] = Object.keys(newFinding);
    expect(shown).toHaveProperty(column, null); // the compare carried the grid's red flag
    expect(queryByText('AI note hidden')).toBeNull();
    expect(alert).toHaveBeenCalledWith(READ_CHANGED_TITLE, READ_CHANGED_BODY);
    expect(alert).not.toHaveBeenCalledWith('Could not update', 'Try again in a moment.');
  });

  it('a failed write rolls back to what was on screen and says so', async () => {
    mockRow = row(CALM);
    const { findByText, queryByText, getByText } = render(<Section eventId="e5" petId="pet-1" petName="Rex" hasPhoto />);
    await findByText(INCIDENT_READ_HIDE_LABEL);
    writer.mockResolvedValue('failed');
    await act(async () => { fireEvent.press(getByText(INCIDENT_READ_HIDE_LABEL)); });
    await act(async () => {});

    expect(queryByText('AI note hidden')).toBeNull();
    expect(queryByText(CALM.read_text)).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Could not update', 'Try again in a moment.');
  });
});

// ── What the section READS is compared, or excluded with a reason (C-34) ─────────
// The dismissal lists claim to be everything Hide takes off the screen. The honest
// source for that is the render itself, so each section is rendered over a row that
// records every column it reads, across fixtures reaching each branch (every red flag
// present, an 'unsure' foreign-material note, the hidden state). A regex over the grid's
// source was green over a destructured read and a column the card draws outside the
// grid (round 4 of the adversarial pass). Stated blind spot (round 5): a column read
// only behind ANOTHER column's value that no fixture holds (a row gated on
// `blood_present === 'coffee_ground'`) is never recorded; add the fixture with the
// branch. A copy of the row (a spread, JSON.stringify) reads every key, so it fails
// loud, never silent.
const NOT_ON_SCREEN: Record<string, string> = {
  status: 'decides which frame renders; a status move under the same read hides nothing new',
  error: 'never rendered (the owner-facing copy guard)',
  edited_at: "the owner's own edit stamp; an edit elsewhere that changes a drawn column is compared through that column",
  ai_raw_payload: 'the edit-diff baseline behind the per-field "edited" marks',
  dismissed_at: 'the hide itself',
  updated_at: "the landing announcer's change marker (#938), never drawn",
};

const RECORDED = [
  {
    name: 'VomitAnalysisSection',
    Section: VomitAnalysisSection,
    columns: VOMIT_DISMISSAL_COLUMNS as readonly string[],
    floor: ['recommendation', 'read_text', 'blood_present', 'foreign_material_note'],
    rows: [
      {
        recommendation: 'worth_a_call', read_text: 'Worth a call.', description: 'Red flecks.', colour: 'yellow',
        consistency: 'foamy', contents: ['foam'], blood_present: 'fresh_red', bile_present: 'yes',
        foreign_material_present: 'yes', foreign_material_note: 'a length of string',
      },
      {
        recommendation: 'monitor', read_text: 'Nothing obviously concerning on its own.', description: null,
        colour: 'clear', consistency: 'liquid', contents: null, blood_present: 'none_visible', bile_present: 'no',
        foreign_material_present: 'unsure', foreign_material_note: 'a small fragment',
      },
    ],
  },
  {
    name: 'StoolAnalysisSection',
    Section: StoolAnalysisSection,
    columns: STOOL_DISMISSAL_COLUMNS as readonly string[],
    floor: ['recommendation', 'read_text', 'stool_blood_present', 'stool_blood_type', 'foreign_material_note'],
    rows: [
      {
        recommendation: 'worth_a_call', read_text: 'Worth a call.', description: 'Dark.', stool_consistency: 'loose',
        stool_colour: 'black_tarry', stool_content: ['mucus'], stool_blood_present: 'yes', stool_blood_type: 'dark_tarry',
        stool_mucus_present: 'yes', foreign_material_present: 'yes', foreign_material_note: 'a sock fibre',
      },
      {
        recommendation: 'monitor', read_text: 'Nothing obviously concerning on its own.', description: null,
        stool_consistency: 'formed', stool_colour: 'brown', stool_content: null, stool_blood_present: 'no',
        stool_blood_type: null, stool_mucus_present: 'no', foreign_material_present: 'unsure', foreign_material_note: 'a fragment',
      },
    ],
  },
];

describe.each(RECORDED)('$name — every column it reads is compared, or excluded with a reason', ({ Section, columns, floor, rows }) => {
  const recorded = new Set<string>();
  const recording = (r: Record<string, unknown>) => new Proxy(r, {
    get(target, key, receiver) {
      // `then` is the Promise machinery asking whether the fetched row is thenable
      // (fetchRow is async), not the section reading a column.
      if (typeof key === 'string' && key !== 'then') recorded.add(key);
      return Reflect.get(target, key, receiver);
    },
  });
  afterEach(() => { mockRow = null; });

  it('over the escalation, the calm read and the hidden state', async () => {
    const base = { status: 'completed', ai_raw_payload: null, edited_at: null, dismissed_at: null, error: null };
    const states = [...rows.map((r) => ({ ...base, ...r })), { ...base, ...rows[0], dismissed_at: '2026-09-26T10:00:00.000Z' }];
    for (const [i, state] of states.entries()) {
      mockRow = recording(state);
      const view = render(<Section eventId={`rec-${i}`} petId="pet-1" petName="Rex" hasPhoto />);
      await view.findByText(state.dismissed_at ? 'AI note hidden' : INCIDENT_READ_HIDE_LABEL);
      view.unmount();
    }
    for (const column of floor) expect(recorded).toContain(column); // the recorder saw the card, not nothing
    const unaccounted = [...recorded].filter((c) => !columns.includes(c) && !(c in NOT_ON_SCREEN));
    expect(unaccounted).toEqual([]);
  });
});
