// EN-5's question on the record (Engines v3 PR-30q, CUL-1724; spec §9), dark behind
// engines_v3_en5. The words are lib/intakeQuestion.ts's and pinned there; this pins what the
// screen does with them: which questions draw, the radio group, the fold, Change, the door,
// the dated line, and flag-off absence.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

let mockFlag = false;
let mockPets: { id: string; species: string; sex: string; name: string }[] = [];
let mockFacts: { freeFed: boolean; trial: unknown } = { freeFed: false, trial: null };
let mockAnswers: Record<string, unknown> = {};
const mockReadChecks = jest.fn(async (_id: string) => mockAnswers);
const mockReadFacts = jest.fn(async (_pet: string) => mockFacts);
const mockSave = jest.fn(async (_i: unknown) => ({}));
const mockPush = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockRouterPush(...a) } }));
jest.mock('../../hooks/useEn5', () => ({ useEn5: () => mockFlag }));
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: mockPets }),
}));
jest.mock('../../store/syncStore', () => ({ useSyncStore: (sel: (s: unknown) => unknown) => sel({ hydrationTick: 0 }) }));
jest.mock('../../lib/intakeChecks', () => ({
  readIntakeChecks: (id: string) => mockReadChecks(id),
  readIntakeQuestionFacts: (pet: string) => mockReadFacts(pet),
  saveIntakeAnswer: (i: unknown) => mockSave(i),
  pushIntakeChecks: () => mockPush(),
}));

import { IntakeQuestion } from './IntakeQuestion';

// The vomit, an hour ago: the question asks from 24 h before it, floored to the hour.
const VOMIT = new Date(Date.now() - 60 * 60_000).toISOString();
const props = { eventId: 'v1', petId: 'pet-a', occurredAt: VOMIT, petName: 'Nyx' };

async function draw(over: Partial<typeof props> = {}) {
  const view = render(<IntakeQuestion {...props} {...over} />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockFlag = true;
  mockPets = [{ id: 'pet-a', species: 'cat', sex: 'female', name: 'Nyx' }];
  mockFacts = { freeFed: false, trial: null };
  mockAnswers = {};
  mockReadChecks.mockClear();
  mockReadFacts.mockClear();
  mockSave.mockClear();
  mockPush.mockClear();
  mockRouterPush.mockClear();
});

describe('flag off', () => {
  it('renders nothing and reads nothing', async () => {
    mockFlag = false;
    const view = await draw();
    expect(view.toJSON()).toBeNull();
    expect(mockReadChecks).not.toHaveBeenCalled();
    expect(mockReadFacts).not.toHaveBeenCalled();
  });
});

describe('which question', () => {
  it('a meal-fed cat: a heading and a radio group of four, never announced', async () => {
    await draw();
    const heading = screen.getByText(/^Has Nyx eaten a meal since \d+ (AM|PM) (yesterday|today)\?$/);
    expect(heading.props.accessibilityRole).toBe('header');
    const radios = ['Yes, ate well', 'A little', 'No', 'Not sure'].map((l) => screen.getByLabelText(l));
    radios.forEach((r, i) => {
      expect(r.props.accessibilityRole).toBe('radio');
      expect(r.props.accessibilityHint).toBe(`${i + 1} of 4`);
    });
    expect(screen.UNSAFE_queryAllByProps({ accessibilityRole: 'radiogroup' }).length).toBeGreaterThan(0);
    expect(screen.UNSAFE_queryAllByProps({ accessibilityLiveRegion: 'polite' })).toEqual([]);
  });

  it('a free-fed cat: the I2 words with the recorded pronoun, and "they" when unknown', async () => {
    mockFacts = { freeFed: true, trial: null };
    mockPets = [{ id: 'pet-a', species: 'cat', sex: 'male', name: 'Pixel' }];
    const view = await draw({ petName: 'Pixel' });
    expect(screen.getByText(/^Have you seen Pixel eat since/)).toBeTruthy();
    expect(screen.getByLabelText("No, he wouldn't")).toBeTruthy();
    expect(screen.getByLabelText("Haven't seen")).toBeTruthy();
    view.unmount();
    mockPets = [{ id: 'pet-a', species: 'cat', sex: 'unknown', name: 'Pixel' }];
    await draw({ petName: 'Pixel' });
    expect(screen.getByLabelText("No, they wouldn't")).toBeTruthy();
  });

  it('a dog: the other-food question only', async () => {
    mockPets = [{ id: 'pet-a', species: 'dog', sex: 'male', name: 'Mochi' }];
    await draw({ petName: 'Mochi' });
    expect(screen.getByText('Could Mochi have eaten something else?')).toBeTruthy();
    expect(screen.queryByText(/eaten a meal/)).toBeNull();
  });

  it('a cat on a running trial: both questions, the trial one naming the protein', async () => {
    mockFacts = {
      freeFed: false,
      trial: { startedAt: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10), targetDurationDays: 56, status: 'active', endedAt: null, protein: 'rabbit' },
    };
    await draw();
    expect(screen.getByText(/^Has Nyx eaten a meal since/)).toBeTruthy();
    expect(screen.getByText('Could Nyx have eaten something off her rabbit trial?')).toBeTruthy();
  });

  it('species "other", or a pet this phone does not hold: nothing', async () => {
    mockPets = [{ id: 'pet-a', species: 'other', sex: 'female', name: 'Nyx' }];
    const a = await draw();
    expect(a.toJSON()).toBeNull();
    a.unmount();
    mockPets = [];
    const b = await draw();
    expect(b.toJSON()).toBeNull();
  });
});

describe('answering', () => {
  it('a tap writes the answer, pushes it, and folds to "You said: … · Change"', async () => {
    await draw();
    mockAnswers = {
      meal_fed: { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'meal_fed', answer: 'a_little', answered_at: new Date().toISOString() },
    };
    await act(async () => {
      fireEvent.press(screen.getByLabelText('A little'));
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'v1', petId: 'pet-a', form: 'meal_fed', answer: 'a_little', existingId: null }));
    expect(mockPush).toHaveBeenCalled();
    expect(screen.getByText('You said: A little')).toBeTruthy();
    expect(screen.queryByLabelText('Not sure')).toBeNull();
  });

  it('Change reopens the group, checked on the answer given, and a new tap changes the same row', async () => {
    mockAnswers = {
      meal_fed: { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'meal_fed', answer: 'yes', answered_at: new Date().toISOString() },
    };
    await draw();
    expect(screen.getByText('You said: Yes, ate well')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('intake-question-change-meal_fed'));
    });
    expect(screen.getByLabelText('Yes, ate well').props.accessibilityState).toEqual({ checked: true });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('No'));
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ answer: 'no', existingId: 'a1', since: '2026-10-07T18:00:00.000Z' }));
  });

  it('Change, then the same answer: the fold closes and nothing is written', async () => {
    mockAnswers = {
      meal_fed: { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'meal_fed', answer: 'no', answered_at: new Date().toISOString() },
    };
    await draw();
    await act(async () => {
      fireEvent.press(screen.getByTestId('intake-question-change-meal_fed'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('No'));
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText('You said: No')).toBeTruthy();
  });

  it('a re-read that fails after a save keeps the answer on screen (C-12)', async () => {
    await draw();
    const saved = { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'meal_fed', answer: 'no', answered_at: new Date().toISOString() };
    mockSave.mockImplementationOnce(async () => saved);
    mockReadChecks.mockImplementationOnce(async () => {
      throw new Error('db busy');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('No'));
    });
    expect(screen.getByText('You said: No')).toBeTruthy();
  });

  it('"Not sure" folds with the dated safety-net line', async () => {
    mockAnswers = {
      meal_fed: { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'meal_fed', answer: 'not_observable', answered_at: new Date().toISOString() },
    };
    await draw();
    expect(screen.getByText('You said: Not sure')).toBeTruthy();
    expect(screen.getByText(/^If Nyx hasn't eaten by 8 AM (today|tomorrow), call your vet\.$/)).toBeTruthy();
  });

  it('a dog\'s Yes opens the meal log for the record\'s pet: a door, never a form on the record', async () => {
    mockPets = [{ id: 'pet-a', species: 'dog', sex: 'male', name: 'Mochi' }];
    mockAnswers = {
      other_food: { id: 'a1', pet_id: 'pet-a', event_id: 'v1', since: '2026-10-07T18:00:00.000Z', form: 'other_food', answer: 'yes', answered_at: new Date().toISOString() },
    };
    await draw({ petName: 'Mochi' });
    fireEvent.press(screen.getByTestId('intake-question-door'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/log', params: { type: 'meal', pet: 'pet-a' } });
    expect(screen.queryByText(/call your vet/)).toBeNull();
  });
});
