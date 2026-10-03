// Engines v3 PR-35 (CUL-1418): the care questions' ask-once memory (device-local).

const mockStore = new Map<string, string>();
let mockReadFails = false;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (mockReadFails) throw new Error('storage unavailable');
    return mockStore.get(k) ?? null;
  }),
  setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import {
  CARE_QUESTION_ASKED_STORAGE_KEY,
  careQuestionShownToday,
  clearCareQuestionAsked,
  markCareQuestionShown,
  mayAskCareQuestion,
  settleCareQuestion,
} from './careQuestionAsked';

beforeEach(() => {
  mockStore.clear();
  mockReadFails = false;
});

it('asks a fresh question, and only one a day across every concern', async () => {
  expect(await mayAskCareQuestion('trial:t1:vomit', '2026-09-30', null)).toBe(true);
  await markCareQuestionShown('trial:t1:vomit', '2026-09-30');
  const shown = await careQuestionShownToday('2026-09-30');
  expect(shown).toBe('trial:t1:vomit');
  // The same question may stand on a second visit to the screen; another may not.
  expect(await mayAskCareQuestion('trial:t1:vomit', '2026-09-30', shown)).toBe(true);
  expect(await mayAskCareQuestion('visit:v1:diarrhea', '2026-09-30', shown)).toBe(false);
  // Tomorrow the other question may be asked.
  expect(await mayAskCareQuestion('visit:v1:diarrhea', '2026-10-01', await careQuestionShownToday('2026-10-01'))).toBe(true);
});

it('a settled question (No, Not sure, Not this time) is never asked again on this device', async () => {
  await settleCareQuestion('course:m1:vomit', '2026-09-30');
  expect(await mayAskCareQuestion('course:m1:vomit', '2026-10-15', null)).toBe(false);
});

it('an unreadable store asks nothing (the re-ask-every-launch direction is the nag)', async () => {
  mockReadFails = true;
  expect(await mayAskCareQuestion('trial:t1:vomit', '2026-09-30', null)).toBe(false);
});

it('the sign-out wipe removes the key, and a write racing it cannot put it back', async () => {
  await settleCareQuestion('course:m1:vomit', '2026-09-30');
  const racing = markCareQuestionShown('trial:t1:vomit', '2026-09-30');
  await clearCareQuestionAsked();
  await racing;
  expect(mockStore.has(CARE_QUESTION_ASKED_STORAGE_KEY)).toBe(false);
});
