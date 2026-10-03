import { careQuestionsFor, localDayOf, myVetKnowsConfirmation, type CareQuestionInput } from './careQuestions';

// Engines v3 PR-35 (CUL-1418): which question may sit above a raised concern's answers, and
// what its "yes" writes (care-state spec §0.3 PMD-4 A, §3.2).

const base: CareQuestionInput = {
  petName: 'Otis',
  sign: 'vomit',
  noun: 'vomiting',
  trial: null,
  courses: [],
  latestVisit: null,
  onsetIso: '2026-08-29T15:00:00Z',
  today: '2026-09-30',
};

describe('careQuestionsFor', () => {
  it('asks nothing with nothing on record', () => {
    expect(careQuestionsFor(base)).toEqual([]);
  });

  it('PMD-4 A, the trial first: names the pet and the sign, and a yes is scoped to the trial from its first day', () => {
    const [q] = careQuestionsFor({ ...base, trial: { id: 't1', startedAt: '2026-09-01', foodLabel: 'hydrolyzed' } });
    expect(q.kind).toBe('trial');
    expect(q.text).toBe("Otis has been on the hydrolyzed trial since Sep 1. Did Otis' vet start it for the vomiting?");
    expect(q.write).toEqual({ source: 'vet_started_trial', anchorOn: '2026-09-01', dietTrialId: 't1' });
    expect(q.key).toBe('trial:t1:vomit');
  });

  it('keys per sign, so a yes for the vomiting never answers the loose stool (GAP-29)', () => {
    const t = { id: 't1', startedAt: '2026-09-01', foodLabel: null };
    expect(careQuestionsFor({ ...base, trial: t })[0].key).not.toBe(careQuestionsFor({ ...base, sign: 'diarrhea', noun: 'loose stool', trial: t })[0].key);
  });

  it('orders trial, then each course newest first, then the visit', () => {
    const qs = careQuestionsFor({
      ...base,
      trial: { id: 't1', startedAt: '2026-09-01', foodLabel: null },
      courses: [{ id: 'm2', drugName: 'Cerenia', startedAt: '2026-09-20' }, { id: 'm1', drugName: 'Prednisone', startedAt: '2026-09-10' }],
      latestVisit: { id: 'v1', visitedAt: '2026-09-16' },
    });
    expect(qs.map((q) => q.key)).toEqual(['trial:t1:vomit', 'course:m2:vomit', 'course:m1:vomit', 'visit:v1:vomit']);
    expect(qs[3].write).toEqual({ source: 'visit_answer', anchorOn: '2026-09-16', vetVisitId: 'v1' });
  });

  it('never asks about a visit before the concern began: a February vaccine visit is not about June’s vomiting (§3.2)', () => {
    expect(careQuestionsFor({ ...base, latestVisit: { id: 'v0', visitedAt: '2026-08-20' } })).toEqual([]);
  });

  it('never asks about a visit when the onset is unknown (a worsening card alone): no guessed bound', () => {
    expect(careQuestionsFor({ ...base, onsetIso: null, latestVisit: { id: 'v1', visitedAt: '2026-09-16' } })).toEqual([]);
  });

  it('never asks about a trial, course or visit that has not started yet', () => {
    expect(careQuestionsFor({
      ...base,
      trial: { id: 't1', startedAt: '2026-10-05', foodLabel: null },
      courses: [{ id: 'm1', drugName: 'Cerenia', startedAt: '2026-10-02' }],
      latestVisit: { id: 'v1', visitedAt: '2026-10-01' },
    })).toEqual([]);
  });

  it('a visit on the onset day itself is askable (the onset is inclusive)', () => {
    expect(careQuestionsFor({ ...base, onsetIso: '2026-09-16', latestVisit: { id: 'v1', visitedAt: '2026-09-16' } })).toHaveLength(1);
  });
});

describe('localDayOf', () => {
  it('keeps a bare day and reads an instant on the local calendar', () => {
    expect(localDayOf('2026-09-01')).toBe('2026-09-01');
    const local = new Date(2026, 8, 1, 23, 30);
    expect(localDayOf(local.toISOString())).toBe('2026-09-01');
    expect(localDayOf('nonsense')).toBeNull();
    expect(localDayOf(null)).toBeNull();
  });
});

describe('the confirmation after "My vet knows" (mock 2b)', () => {
  it('names the date said, the pet and the sign, and promises only what the record can see', () => {
    const c = myVetKnowsConfirmation('Otis', 'loose stool', '2026-09-30');
    expect(c.said).toBe("You told us on Sep 30 that Otis' vet knows about the loose stool.");
    expect(c.does).toBe('Home will stop asking you to book. It comes back if the loose stool comes more often than it has been, or if Otis starts refusing meals.');
    expect(`${c.said} ${c.does}`).not.toMatch(/\b(weight|weigh|seen|acknowledged|resolved|watching|stood down|fine|better)\b/i);
  });
});

describe('a course or trial from long before the concern (adversarial F3)', () => {
  it('is not asked about as started "for" a sign that began months later', () => {
    expect(careQuestionsFor({ ...base, courses: [{ id: 'm0', drugName: 'methimazole', startedAt: '2025-01-10' }] })).toEqual([]);
    expect(careQuestionsFor({ ...base, trial: { id: 't0', startedAt: '2026-05-01', foodLabel: null } })).toEqual([]);
  });

  it('Jordan\u2019s case still asks: a trial started days before the first logged vomit', () => {
    expect(careQuestionsFor({ ...base, onsetIso: '2026-08-29', trial: { id: 't1', startedAt: '2026-08-26', foodLabel: null } })).toHaveLength(1);
  });

  it('stamps the year on a date from another year, so an old course never reads as recent', () => {
    const [q] = careQuestionsFor({
      ...base, today: '2027-01-20', onsetIso: '2026-12-01',
      courses: [{ id: 'm1', drugName: 'Cerenia', startedAt: '2026-12-15' }],
    });
    expect(q.text).toBe("Otis has been on Cerenia since Dec 15, 2026. Did Otis' vet start it for the vomiting?");
  });
});
