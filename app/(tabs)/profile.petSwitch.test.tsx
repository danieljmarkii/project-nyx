// CUL-2174 — the Pet tab's three lists across an in-place pet switch.
//
// The tab switches pets without blurring (CUL-618), so a list held as bare rows
// outlived its pet: a failed read for the new pet left the previous pet's conditions,
// current medicines and past medicines on screen under the new name, and "Log a dose"
// wrote a dose for the new pet against the old pet's course. A first failure drew the
// designed empty state over a read that never answered (C-12).
//
// Harness: `profile.vetVisits.test.tsx`'s, with a Supabase stand-in that answers per
// (table, pet) so each pet's read can succeed, fail or hang on its own. Every table and
// filter the screen asks for is recorded, so a read's pet is the one it filtered on.

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

type Filters = { pet_id?: string; status?: string; id?: string };
type Answer = { data: unknown; error: { message: string } | null };
const mockQuery = jest.fn<Promise<Answer>, [string, Filters]>();
jest.mock('../../lib/supabase', () => {
  function chain(table: string) {
    const filters: Filters = {};
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq', 'or', 'update']) {
      c[m] = jest.fn(() => c);
    }
    c.eq = jest.fn((col: keyof Filters, val: string) => {
      filters[col] = val;
      return c;
    });
    c.then = (res: (a: Answer) => unknown, rej: (e: unknown) => unknown) =>
      mockQuery(table, filters).then(res, rej);
    return c;
  }
  return {
    supabase: {
      from: jest.fn((t: string) => chain(t)),
      auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    },
  };
});
jest.mock('../../lib/storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: jest.fn(),
  getPetPhotoUrl: () => new Promise(() => {}),
  peekPetPhotoUrl: () => null,
  evictPetPhotoUrl: () => {},
  petPhotoVersion: () => 0,
  subscribePetPhotoVersions: () => () => {},
  markPetPhotoChanged: jest.fn(),
  PET_PHOTOS_BUCKET: 'nyx-pet-photos',
  getSignedUrls: jest.fn(() => Promise.resolve(new Map())),
}));

const mockInsertMedicationDose = jest.fn();
jest.mock('../../lib/medicationDose', () => ({
  insertMedicationDose: (...a: unknown[]) => mockInsertMedicationDose(...a),
  applyLogTimeDoubleDoseCheck: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/medicationSetup', () => ({
  ...jest.requireActual('../../lib/medicationSetup'),
  endRegimen: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../components/vetfiles/VetFilesCard', () => ({ VetFilesCard: () => null }));
jest.mock('../../components/vetvisits/VetVisitsCard', () => ({ VetVisitsCard: () => null }));
jest.mock('../../components/profile/WeightTrendCard', () => ({ WeightTrendCard: () => null }));
jest.mock('../../components/profile/EditPetModal', () => ({ EditPetModal: () => null }));
jest.mock('../../components/profile/AddConditionModal', () => ({
  ...jest.requireActual('../../components/profile/AddConditionModal'),
  AddConditionModal: () => null,
}));
jest.mock('../../components/profile/AddMedicationModal', () => ({ AddMedicationModal: () => null }));
jest.mock('../../components/profile/StartTrialModal', () => ({ StartTrialModal: () => null }));
jest.mock('../../components/profile/ArchivePetSheet', () => ({ ArchivePetSheet: () => null }));
jest.mock('../../components/profile/DietTrialCard', () => ({ DietTrialCard: () => null }));
jest.mock('../../components/profile/TrialCompletionSheet', () => ({ TrialCompletionSheet: () => null }));
// The past section is stood in by one line naming the courses it was handed: whose
// courses reach it is the whole question here.
jest.mock('../../components/profile/PastMedicationsSection', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    PastMedicationsSection: ({ rows }: { rows: { name: string }[] }) =>
      rows.length === 0 ? null : createElement(Text, { testID: 'past-section' }, rows.map((r) => r.name).join(', ')),
  };
});
jest.mock('../../lib/vetVisits', () => ({
  ...jest.requireActual('../../lib/vetVisits'),
  readVetVisitsHome: () => new Promise(() => {}),
}));
jest.mock('../../hooks/useDietTrial', () => {
  const reload = jest.fn();
  return { useDietTrial: () => ({ trial: null, reload }) };
});
jest.mock('../../hooks/useTrialAllowedSet', () => ({ useTrialAllowedSet: () => ({ status: 'unknown' }) }));
jest.mock('../../hooks/useWidgetSlotLabel', () => ({ useWidgetSlotLabel: () => null }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
jest.mock('../../lib/vetDocumentLibrary', () => ({
  readVetLibrary: jest.fn(() => Promise.resolve([])),
  buildVetFilesCardModel: () => ({}),
  VET_DOCUMENT_SIGNED_URL_TTL_SEC: 60,
}));
jest.mock('../../lib/dietTrialCard', () => ({ resolveTrialCard: () => null }));
jest.mock('../../store/momentStore', () => {
  const state = { removedEventId: null, showMedication: jest.fn() };
  return {
    useMomentStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../../store/authStore', () => {
  const state = { user: { id: 'u1', email: 'd@example.test' } };
  return {
    useAuthStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

// ONE stable state object, mutated between renders (see `profile.test.tsx`).
const BISCUIT = { id: 'p1', name: 'Biscuit', species: 'dog', photo_path: null, weight_kg: 12 };
const MOCHI = { id: 'p2', name: 'Mochi', species: 'cat', photo_path: null, weight_kg: 4.1 };
const mockPetState: { activePet: typeof BISCUIT; pets: (typeof BISCUIT)[]; updatePet: jest.Mock } = {
  activePet: BISCUIT,
  pets: [BISCUIT, MOCHI],
  updatePet: jest.fn(),
};
jest.mock('../../store/petStore', () => ({
  usePetStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector(mockPetState) : mockPetState),
    { getState: () => mockPetState },
  ),
}));

import { Alert } from 'react-native';
import { render, act, fireEvent, type RenderAPI } from '@testing-library/react-native';
import ProfileScreen from './profile';

const BISCUIT_PRED = '11111111-1111-1111-1111-111111111111';
const BISCUIT_AMOX = '22222222-2222-2222-2222-222222222222';
const MOCHI_GABA = '33333333-3333-3333-3333-333333333333';

function regimen(id: string, petId: string, drug: string, status: 'active' | 'ended') {
  return {
    id, pet_id: petId, medication_item_id: null, drug_name: drug, dose_amount: '5 mg',
    route: 'oral', doses_per_day: 1, schedule_notes: null, indication: null, prescribed_by: null,
    started_at: '2026-09-01', target_duration_days: null, target_duration_doses: null, status,
    ended_at: status === 'ended' ? '2026-09-10' : null,
  };
}
const CONDITIONS: Record<string, unknown[]> = {
  p1: [{ id: 'c1', pet_id: 'p1', condition_name: 'Food sensitivity', diagnosed_at: null, status: 'active', notes: null, created_at: '2026-09-01T00:00:00Z' }],
  p2: [{ id: 'c2', pet_id: 'p2', condition_name: 'Hairballs', diagnosed_at: null, status: 'monitoring', notes: null, created_at: '2026-09-01T00:00:00Z' }],
};
const REGIMENS: Record<string, ReturnType<typeof regimen>[]> = {
  p1: [regimen(BISCUIT_PRED, 'p1', 'Prednisolone', 'active'), regimen(BISCUIT_AMOX, 'p1', 'Amoxicillin', 'ended')],
  p2: [regimen(MOCHI_GABA, 'p2', 'Gabapentin', 'active')],
};

/** Pets whose every read fails, as offline. */
const failing = new Set<string>();
/** Reads held open until the test lets them answer, keyed `${table}:${pet}`. */
const held = new Map<string, Array<() => void>>();
const holding = new Set<string>();

function answerFor(table: string, f: Filters): Answer {
  const pet = f.pet_id ?? '';
  if (failing.has(pet)) return { data: null, error: { message: 'Network request failed' } };
  if (table === 'conditions') return { data: f.pet_id ? CONDITIONS[pet] ?? [] : null, error: null };
  if (table === 'medications') {
    const rows = REGIMENS[pet] ?? [];
    return { data: f.status ? rows.filter((r) => r.status === f.status) : rows, error: null };
  }
  return { data: [], error: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  failing.clear();
  held.clear();
  holding.clear();
  mockPetState.activePet = BISCUIT;
  mockQuery.mockImplementation((table, f) => {
    const key = `${table}:${f.pet_id ?? ''}`;
    if (holding.has(key)) {
      return new Promise((resolve) => {
        held.set(key, [...(held.get(key) ?? []), () => resolve(answerFor(table, f))]);
      });
    }
    return Promise.resolve(answerFor(table, f));
  });
  mockInsertMedicationDose.mockResolvedValue({ eventId: 'e1', occurredAtIso: '2026-10-23T12:00:00.000Z' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
  (console.warn as jest.Mock).mockRestore();
});

async function switchTo(view: RenderAPI, pet: typeof BISCUIT) {
  mockPetState.activePet = pet;
  view.rerender(<ProfileScreen />);
  await act(async () => {});
}

/** Everything on screen that belongs to Biscuit. */
function biscuitRows(view: RenderAPI) {
  return [
    view.queryByText('Food sensitivity'),
    view.queryByText('Prednisolone'),
    view.queryByLabelText('Log a dose of Prednisolone'),
    view.queryByText(/Amoxicillin/),
  ].filter((n) => n !== null);
}

describe('the Pet tab never shows another pet\'s records (CUL-2174)', () => {
  it('a pet switch whose reads fail shows no row of the previous pet, and says the reads failed', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    // Biscuit's page, read for Biscuit: all three lists are there.
    expect(view.getByText('Food sensitivity')).toBeTruthy();
    expect(view.getByText('Prednisolone')).toBeTruthy();
    expect(view.getByTestId('past-section').props.children).toBe('Amoxicillin');

    failing.add('p2');
    await switchTo(view, MOCHI);

    expect(biscuitRows(view)).toEqual([]);
    expect(view.queryByTestId('past-section')).toBeNull();
    expect(view.getByText('Mochi’s conditions could not be read just now.')).toBeTruthy();
    expect(view.getByText('Mochi’s medications could not be read just now.')).toBeTruthy();
    expect(view.getByText('Mochi’s past medications could not be read just now.')).toBeTruthy();
    // Never the designed empty states over a read that did not answer.
    expect(view.queryByText(/No conditions on file yet/)).toBeNull();
    expect(view.queryByText(/No medications/)).toBeNull();
  });

  it('a first read that fails shows the failure with Try again, never the empty state', async () => {
    failing.add('p1');
    const view = render(<ProfileScreen />);
    await act(async () => {});

    expect(view.getByTestId('conditions-read-failed')).toBeTruthy();
    expect(view.getByTestId('medications-read-failed')).toBeTruthy();
    expect(view.getByTestId('past-medications-read-failed')).toBeTruthy();
    expect(view.queryByText(/No conditions on file yet/)).toBeNull();
    expect(view.queryByText(/No medications/)).toBeNull();
  });

  it('Try again reads the pet on screen and draws its rows', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    failing.add('p2');
    await switchTo(view, MOCHI);
    failing.delete('p2');

    await act(async () => { fireEvent.press(view.getByTestId('conditions-read-failed-retry')); });
    await act(async () => { fireEvent.press(view.getByTestId('medications-read-failed-retry')); });
    await act(async () => { fireEvent.press(view.getByTestId('past-medications-read-failed-retry')); });

    expect(view.getByText('Hairballs')).toBeTruthy();
    expect(view.getByText('Gabapentin')).toBeTruthy();
    expect(biscuitRows(view)).toEqual([]);
    expect(view.queryByTestId('conditions-read-failed')).toBeNull();
    expect(view.queryByTestId('medications-read-failed')).toBeNull();
    expect(view.queryByTestId('past-medications-read-failed')).toBeNull();
  });

  it('a read for the previous pet that answers after the switch never lands under the new pet', async () => {
    holding.add('conditions:p1');
    holding.add('medications:p1');
    const view = render(<ProfileScreen />);
    await act(async () => {});

    await switchTo(view, MOCHI);
    expect(view.getByText('Hairballs')).toBeTruthy();
    expect(view.getByText('Gabapentin')).toBeTruthy();

    // Biscuit's reads, still out from before the switch, answer now.
    await act(async () => {
      for (const go of [...held.values()].flat()) go();
    });

    expect(biscuitRows(view)).toEqual([]);
    expect(view.getByText('Hairballs')).toBeTruthy();
    expect(view.getByText('Gabapentin')).toBeTruthy();
  });

  it('Log a dose after a switch writes the on-screen pet against its own course', async () => {
    const view = render(<ProfileScreen />);
    await act(async () => {});
    await switchTo(view, MOCHI);

    await act(async () => { fireEvent.press(view.getByLabelText('Log a dose of Gabapentin')); });

    expect(mockInsertMedicationDose).toHaveBeenCalledTimes(1);
    expect(mockInsertMedicationDose).toHaveBeenCalledWith(
      expect.objectContaining({ petId: 'p2', medicationId: MOCHI_GABA }),
    );
  });

  it('Resolve on a switched page resolves the on-screen pet\'s condition', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const view = render(<ProfileScreen />);
    await act(async () => {});
    await switchTo(view, MOCHI);

    fireEvent.press(view.getByText('Resolve'));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(alertSpy.mock.calls[0][1]).toContain('Hairballs');
    await act(async () => { buttons.find((b) => b.text === 'Mark resolved')?.onPress?.(); });

    expect(view.queryByText('Hairballs')).toBeNull();
    alertSpy.mockRestore();
  });
});
