import {
  CHANNEL_OPTIONS,
  LOG_CONTACT_LABEL,
  composeContactedAt,
  contactSaveLabel,
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
