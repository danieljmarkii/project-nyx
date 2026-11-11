// Vet report v2 PR-23b (CUL-2454): the photo picker's pure half.
import {
  leftOutChanged,
  normaliseLeftOut,
  parseReportPhotos,
  photoFlagLine,
  photoIncludesLine,
  photoShortfallLine,
  photoRowLabel,
  photoRowTitle,
  type ReportPhoto,
} from './reportPhotoPicker';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** Local noon, so the day it names is the same in every zone CI runs (C-29). */
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const photo = (attachmentId: string, over: Partial<ReportPhoto> = {}): ReportPhoto => ({
  attachmentId, eventId: `ev-${attachmentId.slice(0, 1)}`, type: 'vomit', occurredAt: noon(2026, 7, 2), safety: null, ...over,
});

describe('parseReportPhotos', () => {
  it('absent or not a list is no picker (v1, an older server)', () => {
    expect(parseReportPhotos(undefined)).toBeNull();
    expect(parseReportPhotos(null)).toBeNull();
    expect(parseReportPhotos({ attachmentId: A })).toBeNull();
  });

  it('keeps well-formed entries, lower-cases ids, and drops anything malformed rather than guessing', () => {
    const out = parseReportPhotos([
      { attachmentId: A.toUpperCase(), eventId: 'e1', type: 'vomit', occurredAt: noon(2026, 7, 2), safety: 'blood' },
      { attachmentId: 'not-an-id', eventId: 'e2', type: 'vomit', occurredAt: noon(2026, 7, 2), safety: null },
      { attachmentId: B, eventId: 'e3', type: 'vomit', occurredAt: 'yesterday', safety: null },
      { attachmentId: C, eventId: 'e4', type: 'diarrhea', occurredAt: noon(2026, 6, 28), safety: 'weird' },
      7,
      null,
    ]);
    expect(out).toEqual([
      { attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: noon(2026, 7, 2), safety: 'blood' },
      { attachmentId: C, eventId: 'e4', type: 'diarrhea', occurredAt: noon(2026, 6, 28), safety: null },
    ]);
  });
});

describe('the choice', () => {
  const photos = [photo(A), photo(B), photo(C)];

  it('normalises to photos this report holds, in the report\'s order, case ignored', () => {
    expect(normaliseLeftOut(photos, [C, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', A.toUpperCase()])).toEqual([A, C]);
  });

  it('a Done that leaves the same photos out is no change (no rebuild)', () => {
    expect(leftOutChanged([A, C], [C, A])).toBe(false);
    expect(leftOutChanged([], [])).toBe(false);
    expect(leftOutChanged([A], [A, B])).toBe(true);
    expect(leftOutChanged([A, B], [A, C])).toBe(true);
  });

  it('the row says how many of the photos this report holds', () => {
    expect(photoRowLabel(4, 0)).toBe('Photos · 4 · Choose');
    expect(photoRowLabel(4, 1)).toBe('Photos · 3 of 4 · Choose');
    expect(photoRowLabel(4, 4)).toBe('Photos · 0 of 4 · Choose');
  });
});

describe('row words', () => {
  it('names the incident and its local day; the year only when it is not this year', () => {
    expect(photoRowTitle(photo(A), '2026-11-06')).toBe('Vomit · Jul 2');
    expect(photoRowTitle(photo(A, { type: 'diarrhea' }), '2027-01-03')).toBe('Loose stool · Jul 2, 2026');
    expect(photoRowTitle(photo(A, { type: 'something_new' }), '2026-11-06')).toBe('Incident · Jul 2');
  });

  it('a flagged photo is named as flagged; an unflagged one carries no line', () => {
    expect(photoFlagLine('blood')).toBe('Flagged: blood seen');
    expect(photoFlagLine('foreign')).toBe('Flagged: something not food seen');
    expect(photoFlagLine(null)).toBeNull();
  });
});

// CUL-1473: the Send bar says what the vet receives, never only what was taken.
describe('photoIncludesLine / photoShortfallLine', () => {
  it('all embedded: one number, and no shortfall line', () => {
    expect(photoIncludesLine(1, 1)).toBe('Includes 1 photo from logged incidents.');
    expect(photoIncludesLine(3, 3)).toBe('Includes 3 photos from logged incidents.');
    expect(photoShortfallLine(3, 3)).toBeNull();
  });
  it('some omitted: both numbers, and what became of the rest', () => {
    expect(photoIncludesLine(57, 40)).toBe(
      'Includes 40 of 57 photos from logged incidents. The other 17 are noted in the report, without the pictures.',
    );
    expect(photoIncludesLine(2, 1)).toBe(
      'Includes 1 of 2 photos from logged incidents. The other one is noted in the report, without the picture.',
    );
    expect(photoShortfallLine(57, 40)).toBe('40 of 57 photos fit in the report. The other 17 are noted in the report, without the pictures.');
  });
  it('carries no exclamation mark', () => {
    for (const l of [photoIncludesLine(57, 40), photoIncludesLine(3, 3), photoShortfallLine(2, 0)]) expect(l).not.toMatch(/!/);
  });
});
