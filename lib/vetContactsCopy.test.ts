// Vet contacts PR-06 (CUL-2749 / CUL-2768): the record’s words (lib/vetContacts.ts), one function per fact.
import {
  contactClock,
  contactFootnote,
  contactPageHeader,
  courseSourceLine,
  formatShortWeekday,
  historyContactPhrase,
  historyContactText,
  startedPhrase,
} from './vetContacts';
import { buildVisitListRow, channelOf, type LocalVetVisit } from './vetVisits';
import { dateOnlyItemsOf } from './historyDays';
import { dateOnlyItemText } from './historyScreen';

const NOW = new Date(2026, 10, 14, 12, 0, 0);

describe('the contact page header', () => {
  it('names the pet, the channel, the short day and "no exam"', () => {
    expect(contactPageHeader('Nyx', 'phone', '2026-11-09', null)).toEqual({
      title: 'Nyx’s call',
      subtitle: 'Phone · Mon, Nov 9 · no exam',
    });
  });

  it('prints the time only when the instant falls on the record’s own local day (C-29: local parts)', () => {
    const sameDay = new Date(2026, 10, 13, 16, 10).toISOString();
    const nextDay = new Date(2026, 10, 14, 9, 0).toISOString();
    expect(contactClock('2026-11-13', sameDay)).toBe('4:10 pm');
    expect(contactClock('2026-11-13', nextDay)).toBeNull();
    expect(contactClock('2026-11-13', 'not a date')).toBeNull();
  });

  it('refuses a malformed day rather than fabricating one', () => {
    expect(formatShortWeekday('2026-02-30')).toBe('');
    expect(formatShortWeekday('2026-13-01')).toBe('');
  });
});

describe('the footnote', () => {
  it('names what the contact started, or drops the clause when nothing was', () => {
    const started = startedPhrase({ medications: [{ drugName: 'Motazol' }, { drugName: 'Cerenia' }], trials: [{ label: 'Diet trial' }] });
    expect(started).toBe('the Motazol, the Cerenia and the diet trial');
    expect(contactFootnote('phone', started, true)).toBe(
      'Your vet report shows this call and the Motazol, the Cerenia and the diet trial. Screenshots stay in Vet Files; share them from there.',
    );
    expect(contactFootnote('email', startedPhrase({ medications: [], trials: [] }), false)).toBe('Your vet report shows this email. No exam.');
  });
});

describe('a course’s source line', () => {
  it.each([
    ['phone', 'Started after a call with the vet, Nov 9'],
    ['text', 'Started after a text with the vet, Nov 9'],
    ['email', 'Started after an email with the vet, Nov 9'],
    ['in_clinic', 'Started after a visit, Nov 9'],
  ] as const)('%s', (channel, line) => {
    expect(courseSourceLine(channel, '2026-11-09', NOW)).toBe(line);
  });
});

describe('History (D4)', () => {
  it('a contact’s title follows its channel and its detail ends on "no exam"', () => {
    expect(historyContactText('text', 'Ear', 'Completely Cat Clinic')).toEqual({
      title: 'Texts with the vet',
      detail: 'Ear · Completely Cat Clinic · no exam',
    });
    expect(historyContactPhrase('email', null)).toBe('Email with the vet, no exam');
  });

  it('dateOnlyItemsOf carries a known channel and leaves the shipped shape when there is none', () => {
    const range = { fromDay: '2026-11-01', toDay: '2026-11-30' };
    const base = { id: 'v', petId: 'p', visitedAt: '2026-11-09', sortMs: 0, reason: 'Ear', where: '' };
    const items = dateOnlyItemsOf({ visits: [{ ...base, channel: 'phone' }, { ...base, id: 'w' }], courses: [], bowls: [], range });
    const day = items.get('2026-11-09') ?? [];
    expect(day.map((i) => ('channel' in i ? i.channel : 'absent'))).toEqual(['phone', 'absent']);
    expect(dateOnlyItemText(day[0]).title).toBe('Phone call with the vet');
    expect(dateOnlyItemText(day[1]).title).toBe('Vet visit');
  });
});

describe('the list row', () => {
  const visit: LocalVetVisit = {
    id: 'v', pet_id: 'p', visited_at: '2026-11-09', clinic_name: null, vet_name: null, reason: null,
    notes: null, next_visit_at: null, deleted_at: null,
  };
  const links = { medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: false };

  it('a row of unknown channel is the shipped shape, byte for byte', () => {
    expect(buildVisitListRow({ ...visit, channel: null }, links, NOW)).toEqual(buildVisitListRow(visit, links, NOW));
    expect(buildVisitListRow(visit, links, NOW)).not.toHaveProperty('channel');
  });

  it('a contact carries its channel and a stand-in title that never says "Visit"', () => {
    const row = buildVisitListRow({ ...visit, channel: 'text' }, links, NOW);
    expect(row.channel).toBe('text');
    expect(row.contactTitle).toBe('Texts on Nov 9');
    expect(row.title).toBe('Visit on Nov 9'); // the shipped field, shown only while the feature is off
  });

  it('channelOf reads only the four CHECKed values', () => {
    expect(['in_clinic', 'phone', 'text', 'email', null, 'fax', 3].map(channelOf)).toEqual([
      'in_clinic', 'phone', 'text', 'email', null, null, null,
    ]);
  });
});
