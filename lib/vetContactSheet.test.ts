import {
  CHANNEL_OPTIONS,
  LOG_CONTACT_LABEL,
  WHEN_ROW_MIN_WIDTH,
  composeContactedAt,
  contactSaveLabel,
  latestTimeOn,
  whenFieldsStack,
  contactSheetFootnote,
  contactSheetTitle,
} from './vetContactSheet';
import { VISIT_CHANNELS } from './vetVisits';

// Vet contacts PR-04 (CUL-2766): the sheet's words, against spec §4.2's table verbatim.

describe('spec §4.2: title, Save and footnote follow the chip', () => {
  it.each([
    ['in_clinic', 'A visit that happened', 'Save Nyx’s visit', 'Your next vet report starts from this visit.'],
    ['phone', 'A call with the vet', 'Save Nyx’s call', 'Goes on Nyx’s vet report as a phone call. No exam.'],
    ['text', 'Texts from the vet', 'Save Nyx’s texts', 'Goes on Nyx’s vet report as texts with the vet. No exam.'],
    ['email', 'An email from the vet', 'Save Nyx’s email', 'Goes on Nyx’s vet report as an email. No exam.'],
  ] as const)('%s', (channel, title, save, footnote) => {
    expect(contactSheetTitle(channel)).toBe(title);
    expect(contactSaveLabel(channel, 'Nyx', [])).toBe(save);
    expect(contactSheetFootnote(channel, 'Nyx')).toBe(footnote);
  });

  it('every remote footnote says "No exam"; the clinic one never does', () => {
    for (const c of VISIT_CHANNELS) {
      expect(contactSheetFootnote(c, 'Nyx').includes('No exam')).toBe(c !== 'in_clinic');
    }
  });

  it('never says "from today" (the report’s rung 1 is strictly before today)', () => {
    const all = [
      LOG_CONTACT_LABEL,
      ...VISIT_CHANNELS.flatMap((c) => [contactSheetTitle(c), contactSaveLabel(c, 'Nyx', []), contactSheetFootnote(c, 'Nyx')]),
    ];
    for (const s of all) {
      expect(s.toLowerCase()).not.toContain('from today');
      expect(s).not.toContain('!');
    }
  });
});

describe('the Save label with Also about (mock B2)', () => {
  it('one pet, two pets, three pets', () => {
    expect(contactSaveLabel('email', 'Pixel', [])).toBe('Save Pixel’s email');
    expect(contactSaveLabel('email', 'Pixel', ['Juniper'])).toBe('Save for Pixel and Juniper');
    expect(contactSaveLabel('email', 'Pixel', ['Juniper', 'Moss'])).toBe('Save for Pixel and 2 others');
  });
});

describe('the chips', () => {
  it('are the four channels in the spec’s order, Text spoken with "or clinic app"', () => {
    expect(CHANNEL_OPTIONS.map((o) => o.value)).toEqual([...VISIT_CHANNELS]);
    expect(CHANNEL_OPTIONS.map((o) => o.label)).toEqual(['At the clinic', 'Phone', 'Text', 'Email']);
    expect(CHANNEL_OPTIONS.find((o) => o.value === 'text')!.spoken).toBe('Text or clinic app');
  });
});

describe('composeContactedAt: the optional time as a UTC instant (C-10)', () => {
  it('no time is no instant: the day only', () => {
    expect(composeContactedAt(new Date(2026, 10, 9), null)).toBeNull();
  });

  it('the picked LOCAL wall-clock time on the picked LOCAL day', () => {
    const at = composeContactedAt(new Date(2026, 10, 9), new Date(2000, 0, 1, 16, 10));
    const back = new Date(at!);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours(), back.getMinutes()]).toEqual([
      2026, 10, 9, 16, 10,
    ]);
    expect(at!.endsWith('Z')).toBe(true);
  });
});

describe('a past contact is never in the future (code-reviewer, PR-04)', () => {
  const NOW = new Date(2026, 10, 19, 8, 15);
  it('a time later than now on today saves as now', () => {
    const at = composeContactedAt(new Date(2026, 10, 19), new Date(2000, 0, 1, 9, 0), NOW);
    expect(at).toBe(NOW.toISOString());
  });
  it('an earlier time on today, and any time on an earlier day, saves as picked', () => {
    expect(composeContactedAt(new Date(2026, 10, 19), new Date(2000, 0, 1, 7, 30), NOW)).toBe(
      new Date(2026, 10, 19, 7, 30).toISOString(),
    );
    expect(composeContactedAt(new Date(2026, 10, 18), new Date(2000, 0, 1, 23, 50), NOW)).toBe(
      new Date(2026, 10, 18, 23, 50).toISOString(),
    );
  });
  it('the picker’s bound is now on today, none on an earlier day', () => {
    expect(latestTimeOn(new Date(2026, 10, 19, 0, 0), NOW)).toBe(NOW);
    expect(latestTimeOn(new Date(2026, 10, 18, 12, 0), NOW)).toBeUndefined();
  });
});

describe('Day and Time stack where they cannot both read whole (mock B5, B6)', () => {
  it('side by side on a standard phone at the default size', () => {
    expect(whenFieldsStack(390 - 48, 1)).toBe(false);
  });
  it('stacked at 320pt', () => {
    expect(whenFieldsStack(320 - 48, 1)).toBe(true);
  });
  it('stacked at large text on a standard phone; the floor scales with the text', () => {
    expect(whenFieldsStack(390 - 48, 1.3)).toBe(true);
    expect(whenFieldsStack(WHEN_ROW_MIN_WIDTH, 1)).toBe(false);
    expect(whenFieldsStack(WHEN_ROW_MIN_WIDTH - 1, 1)).toBe(true);
  });
  it('a text size below the default never un-stacks a narrow column', () => {
    expect(whenFieldsStack(272, 0.8)).toBe(true);
  });
});
