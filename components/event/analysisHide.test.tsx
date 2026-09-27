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
} from '../../lib/analysisDismissal';

const writer = writeAnalysisDismissal as jest.MockedFunction<typeof writeAnalysisDismissal>;

const CALM = { recommendation: 'monitor', read_text: 'Nothing obviously concerning in this one on its own.' };
const CALL = { recommendation: 'worth_a_call', read_text: 'There is blood in this one. Worth a call to your vet.' };

const SECTIONS = [
  {
    name: 'VomitAnalysisSection',
    Section: VomitAnalysisSection,
    base: {
      description: null, colour: null, contents: null, consistency: null, blood_present: null,
      bile_present: null, foreign_material_present: null, foreign_material_note: null,
    },
  },
  {
    name: 'StoolAnalysisSection',
    Section: StoolAnalysisSection,
    base: {
      description: null, stool_consistency: null, stool_colour: null, stool_content: null,
      stool_blood_present: null, stool_blood_type: null, stool_mucus_present: null,
      foreign_material_present: null, foreign_material_note: null,
    },
  },
] as const;

describe.each(SECTIONS)('$name — Hide and Show write only over the words on screen (CUL-1323)', ({ Section, base }) => {
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
