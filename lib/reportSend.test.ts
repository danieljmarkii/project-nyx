import {
  ASSUMED_CLINIC_CLOSE_HOUR,
  ASSUMED_CLINIC_OPEN_HOUR,
  EMAIL_QUESTION_MAX,
  callRowsFor,
  confirmationCopy,
  emailBody,
  emailBodyText,
  emailSubject,
  sendCallCard,
  sendDocumentsOf,
  sendIsQuiet,
  sendStatusWords,
  subjectIsClean,
  uncheckedLive,
  type EmailBodyInput,
  type SendResult,
  type SendTarget,
} from './reportSend';
import { liveCardCopy, type ComposerLive } from './reportComposer';

const TODAY = '2026-10-31';
const FLAGGED: ComposerLive = {
  state: 'flags',
  startDate: '2026-09-06',
  endDate: TODAY,
  flags: [
    { kind: 'present_foreign', sign: 'vomit', trigger: null },
    { kind: 'symptom_burden', sign: 'vomit', trigger: null },
    { kind: 'weight_loss', sign: null, trigger: null },
    { kind: 'trial_diet_refusal', sign: null, trigger: null },
    { kind: 'chronicity', sign: 'vomit', trigger: null },
  ],
};
const NONE: ComposerLive = { state: 'none', startDate: '2026-09-06', endDate: TODAY, flags: [] };

const base: EmailBodyInput = {
  petName: 'Nyx',
  live: FLAGGED,
  startDate: '2026-09-16',
  endDate: TODAY,
  today: TODAY,
  visitDay: '2026-11-03',
  note: 'It seems like we’re mostly down to scarf and barfs now. We got Nyx a slow feeder!',
  questions: ['Does the Dentastix reset the trial clock?', '  ', 'Should we stop the cetirizine?'],
};

describe('the status words follow what the app knows (WBC-5)', () => {
  const cases: Array<[SendTarget, string, SendResult, string | null]> = [
    ['email', 'ios', 'sent', 'Sent from your Mail app'],
    ['email', 'ios', 'undetermined', 'Handed to your Mail app'],
    ['email', 'android', 'sent', 'Handed to your Mail app'],
    ['email', 'android', 'undetermined', 'Handed to your Mail app'],
    ['email', 'ios', 'saved', null],
    ['email', 'ios', 'cancelled', null],
    ['email', 'android', 'cancelled', null],
    ['email', 'ios', 'failed', null],
    ['print', 'ios', 'done', 'Sent to print'],
    ['print', 'ios', 'failed', null],
    ['share', 'android', 'done', 'Shared'],
    ['copy', 'ios', 'done', 'Copied'],
  ];
  it.each(cases)('%s on %s, %s → %p', (target, platform, result, words) => {
    expect(sendStatusWords(target, platform, result)).toBe(words);
  });

  it('only an iOS Mail "sent" reads "Sent from your Mail app"', () => {
    const targets: SendTarget[] = ['email', 'print', 'share', 'copy'];
    const results: SendResult[] = ['sent', 'saved', 'cancelled', 'undetermined', 'done', 'failed'];
    for (const t of targets) for (const p of ['ios', 'android', 'web']) for (const r of results) {
      const w = sendStatusWords(t, p, r);
      expect(w === 'Sent from your Mail app').toBe(t === 'email' && p === 'ios' && r === 'sent');
    }
  });
});

describe('the email body (R-12, BRK-5): every sentence is fixed, a record line, or the owner’s words', () => {
  const sentences = emailBody(base);

  it('pins each sentence to its source', () => {
    expect(sentences.map((s) => [s.id, s.source])).toEqual([
      ['greeting', 'fixed'],
      ['attached', 'fixed'],
      ['flags', 'record'],
      ['note', 'owner'],
      ['questions', 'fixed'],
      ['question-1', 'owner'],
      ['question-2', 'owner'],
      ['kept', 'fixed'],
    ]);
  });

  it('the fixed sentences are the template, with only the name, the dates and the visit in their slots', () => {
    const byId = Object.fromEntries(sentences.map((s) => [s.id, s.text]));
    expect(byId.greeting).toBe('Hello,');
    expect(byId.attached).toBe('Attached is Nyx’s home log for Sep 16 to Oct 31, for the visit on Nov 3.');
    expect(byId.questions).toBe('My questions:');
    expect(byId.kept).toBe('It was kept in the Culprit app, owner-reported, not a diagnosis.');
  });

  it('the record line is the call card’s own body, verbatim', () => {
    const card = liveCardCopy(FLAGGED, 'Nyx');
    expect(sentences.find((s) => s.id === 'flags')?.text).toBe(`Flags from the last 56 days: ${card?.body}`);
  });

  it('the owner’s note survives verbatim, quoted and labelled, exclamation mark included', () => {
    expect(sentences.find((s) => s.id === 'note')?.text).toBe(`My note: “${base.note}”`);
  });

  it('every owner question survives verbatim, blanks dropped, and the count is the typed count', () => {
    const qs = sentences.filter((s) => s.id.startsWith('question-'));
    expect(qs.map((s) => s.text)).toEqual([
      '1. “Does the Dentastix reset the trial clock?”',
      '2. “Should we stop the cetirizine?”',
    ]);
  });

  it('at most five questions travel', () => {
    const many = emailBody({ ...base, questions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(many.filter((s) => s.source === 'owner' && s.id.startsWith('question-'))).toHaveLength(EMAIL_QUESTION_MAX);
  });

  it('no owner sentence is anything but the owner’s text inside its label', () => {
    for (const s of sentences.filter((x) => x.source === 'owner')) {
      const inner = s.text.match(/“([\s\S]*)”$/)?.[1];
      expect(inner).toBeDefined();
      expect([base.note.trim(), ...base.questions.map((q) => q.trim())]).toContain(inner);
    }
  });

  it('names no drug, food or dose the owner did not type: the code sentences hold none of the record’s nouns', () => {
    const codeText = sentences.filter((s) => s.source !== 'owner').map((s) => s.text).join(' ');
    for (const word of ['Dentastix', 'cetirizine', 'mg', 'kibble', 'scarf']) expect(codeText).not.toContain(word);
  });

  it('a quiet record carries no flags sentence, and an unchecked one says it couldn’t check (louder, never silent)', () => {
    expect(emailBody({ ...base, live: NONE }).some((s) => s.id === 'flags' || s.id === 'unchecked')).toBe(false);
    const unchecked = emailBody({ ...base, live: uncheckedLive(TODAY) });
    expect(unchecked.find((s) => s.id === 'unchecked')?.source).toBe('fixed');
  });

  it('no note, no questions, no visit: only the template', () => {
    const bare = emailBody({ ...base, live: NONE, note: '   ', questions: [], visitDay: null });
    expect(bare.map((s) => s.id)).toEqual(['greeting', 'attached', 'kept']);
    expect(bare[1].text).toBe('Attached is Nyx’s home log for Sep 16 to Oct 31.');
  });

  it('the text the Mail app gets holds every sentence in order', () => {
    const text = emailBodyText(sentences);
    let at = -1;
    for (const s of sentences) {
      const next = text.indexOf(s.text);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(text).toContain('My questions:\n1. “Does');
  });
});

describe('the subject (BRK-12): a template with no counts, percentages or weights', () => {
  const input = {
    petName: 'Nyx',
    ownerSurname: 'Reyes',
    live: FLAGGED,
    startDate: '2026-09-16',
    endDate: TODAY,
    today: TODAY,
    visitDay: '2026-11-03',
  };

  it('names the pet with surname, each flag in words, the window and the visit', () => {
    expect(emailSubject(input)).toBe(
      'Nyx (Reyes) · owner’s home log · flags: possible foreign material, frequent signs this week, weight down, trial diet not finished, long-running signs · Sep 16 to Oct 31 · visit Nov 3',
    );
  });

  it('carries no digit outside its dates', () => {
    const s = emailSubject(input).replace(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}(?:, \d{4})?/g, '');
    expect(s).not.toMatch(/\d/);
  });

  it('every flag kind’s noun is digit-free, including one this build has never heard of', () => {
    const kinds = ['present_blood', 'present_foreign', 'intake_decline', 'trial_diet_refusal', 'chronicity', 'symptom_burden',
      'symptom_worsening', 'weight_loss', 'weight_unchecked', 'protein_mismatch', 'unknown_future_kind'];
    for (const kind of kinds) {
      const s = emailSubject({ ...input, live: { ...FLAGGED, flags: [{ kind, sign: 'vomit', trigger: null }] } });
      expect(s.split(' · ')[2]).toMatch(/^flags: [a-z -]+$/);
    }
  });

  it('a refusal reads as refusing, never as eating less', () => {
    const s = emailSubject({ ...input, live: { ...FLAGGED, flags: [{ kind: 'intake_decline', sign: null, trigger: 'refused_normal_food' }] } });
    expect(s).toContain('refusing food');
    expect(s).not.toContain('eating less');
  });

  it('the guard rejects a digit beside %, kg or lb', () => {
    for (const bad of ['down 15%', 'down 15 %', '3.73 kg', '8.2lb', '8 lbs', '4 kilos', '12 percent']) {
      expect(subjectIsClean(`Nyx · ${bad}`)).toBe(false);
    }
    for (const ok of ['Nyx · weight down · Sep 16 to Oct 31', 'Nyx · visit Nov 3']) expect(subjectIsClean(ok)).toBe(true);
  });

  it('a name the owner typed with a weight in it never carries the weight into the subject', () => {
    const s = emailSubject({ ...input, petName: 'Tank 40kg', ownerSurname: 'Lee 5%' });
    expect(subjectIsClean(s)).toBe(true);
    expect(s.startsWith('Tank (Lee) · ')).toBe(true);
  });

  it('a quiet record names no flags; an unchecked one says so', () => {
    expect(emailSubject({ ...input, live: NONE })).not.toContain('flags');
    expect(emailSubject({ ...input, live: uncheckedLive(TODAY) })).toContain('flags not checked');
  });
});

describe('the call card and its rows (d1, d5)', () => {
  it('during the assumed day, the clinic leads', () => {
    expect(callRowsFor(ASSUMED_CLINIC_OPEN_HOUR, 'Nyx').map((r) => r.id)).toEqual(['clinic', 'emergency']);
    expect(callRowsFor(ASSUMED_CLINIC_CLOSE_HOUR - 1, 'Nyx').map((r) => r.id)).toEqual(['clinic', 'emergency']);
  });

  it('after hours, the emergency clinic leads, and both rows always print', () => {
    for (const h of [ASSUMED_CLINIC_CLOSE_HOUR, 23, 0, ASSUMED_CLINIC_OPEN_HOUR - 1]) {
      expect(callRowsFor(h, 'Nyx').map((r) => r.id)).toEqual(['emergency', 'clinic']);
    }
  });

  it('never claims to know the clinic is closed', () => {
    for (let h = 0; h < 24; h += 1) for (const r of callRowsFor(h, 'Nyx')) expect(r.text).not.toMatch(/clinic is closed|closed now\./);
  });

  it('a flagged record gets the composer’s card with rows; an unchecked one the couldn’t-check card with none; a quiet one none', () => {
    const card = sendCallCard(FLAGGED, 'Nyx', 10);
    expect(card?.title).toBe(liveCardCopy(FLAGGED, 'Nyx')?.title);
    expect(card?.rows).toHaveLength(2);
    const unchecked = sendCallCard(uncheckedLive(TODAY), 'Nyx', 10);
    expect(unchecked?.title).toMatch(/Couldn’t check/);
    expect(unchecked?.rows).toEqual([]);
    expect(sendCallCard(NONE, 'Nyx', 10)).toBeNull();
  });

  it('only a read that answered "none" is quiet: unchecked is treated as flagged (no check, no haptic)', () => {
    expect(sendIsQuiet(NONE)).toBe(true);
    expect(sendIsQuiet(FLAGGED)).toBe(false);
    expect(sendIsQuiet(uncheckedLive(TODAY))).toBe(false);
  });
});

describe('the confirmation names the pet, the window and how it left (e1, e2)', () => {
  it('reads the status words, never "saved"', () => {
    expect(confirmationCopy('Olive', '2026-09-20', TODAY, TODAY, 'Sent from your Mail app')).toEqual({
      title: 'Olive’s report',
      line: 'Sep 20 to Oct 31 · sent from your Mail app',
    });
    expect(JSON.stringify(confirmationCopy('Olive', '2026-09-20', TODAY, TODAY, 'Shared'))).not.toMatch(/saved/i);
  });
});

describe('vet documents are listed one by one, and only a whole file on this phone can attach (GAP-25)', () => {
  it('names where to send the rest from', () => {
    const rows = [
      { id: 'a', title: 'Bloodwork', kindLabel: 'Lab results', dateLabel: 'Oct 2', isPdf: true, pageCount: 3, localUri: 'file:///a.pdf' },
      { id: 'b', title: 'Invoice', kindLabel: 'Invoice or estimate', dateLabel: 'Sep 30', isPdf: false, pageCount: 1, localUri: 'file:///b.jpg' },
      { id: 'c', title: 'Discharge', kindLabel: null, dateLabel: 'Sep 1', isPdf: false, pageCount: 2, localUri: 'file:///c.jpg' },
      { id: 'd', title: 'Vaccines', kindLabel: null, dateLabel: 'Aug 1', isPdf: true, pageCount: 1, localUri: '' },
    ];
    expect(sendDocumentsOf(rows)).toEqual([
      { id: 'a', title: 'Bloodwork', detail: 'Lab results · Oct 2', uri: 'file:///a.pdf', why: null },
      { id: 'b', title: 'Invoice', detail: 'Invoice or estimate · Sep 30', uri: 'file:///b.jpg', why: null },
      { id: 'c', title: 'Discharge', detail: 'Sep 1', uri: null, why: 'Several pages. Send it from Vet Files.' },
      { id: 'd', title: 'Vaccines', detail: 'Aug 1', uri: null, why: 'Not on this phone. Send it from Vet Files.' },
    ]);
  });
});
