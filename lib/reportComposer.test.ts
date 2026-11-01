import {
  COUNTS_INCOMPLETE_LINE,
  LIVE_FLAG_DAYS,
  THIN_RECORD_DAYS,
  afterDisclosure,
  composerDate,
  composerNoteOf,
  coverageLine,
  createRequestLatch,
  leadLine,
  liveCardCopy,
  monthGrid,
  nextRange,
  parseComposerOpen,
  parseComposerWindow,
  rangeFooter,
  weightLine,
  windowDatesLine,
  type ComposerCounts,
  type ComposerLive,
} from './reportComposer';

const TODAY = '2026-10-31';

const counts = (over: Partial<ComposerCounts> = {}): ComposerCounts => ({
  startDate: '2026-09-16',
  endDate: TODAY,
  windowDays: 46,
  loggedDays: 45,
  symptomEntries: 24,
  weighIns: 1,
  latestWeighIn: { lbs: 8.2, date: '2026-09-16' },
  lead: { sign: 'vomit', reason: 'flag' },
  loggedDayKeys: ['2026-09-16'],
  incomplete: false,
  ...over,
});

const live = (over: Partial<ComposerLive> = {}): ComposerLive => ({
  state: 'flags',
  startDate: '2026-09-06',
  endDate: TODAY,
  flags: [
    { kind: 'present_foreign', sign: 'vomit' },
    { kind: 'symptom_burden', sign: 'vomit' },
  ],
  ...over,
});

describe('the words (round 5 frames b1 to b4)', () => {
  it('dates read short, with the year only when it is not this year', () => {
    expect(composerDate('2026-09-16', TODAY)).toBe('Sep 16');
    expect(composerDate('2025-12-30', TODAY)).toBe('Dec 30, 2025');
    expect(windowDatesLine({ startDate: '2026-09-16', endDate: TODAY, days: 46 }, TODAY)).toBe('Sep 16 to Oct 31 · 46 days');
  });

  it('coverage names the logged days against the window', () => {
    expect(coverageLine(counts())).toBe('45 of 46 days have an entry.');
    expect(coverageLine(counts({ loggedDays: 46 }))).toBe('All 46 days have an entry.');
    expect(coverageLine(counts({ windowDays: 1, loggedDays: 0 }))).toBe('0 of 1 day has an entry.');
  });

  it('weight reads lb with no percentage (ruling W): "3 weigh-ins · 70.1 lb on Oct 27"', () => {
    expect(weightLine(counts({ weighIns: 3, latestWeighIn: { lbs: 70.1, date: '2026-10-27' } }), TODAY)).toBe(
      '3 weigh-ins · 70.1 lb on Oct 27',
    );
    expect(weightLine(counts(), TODAY)).toBe('1 weigh-in · 8.2 lb on Sep 16');
    expect(weightLine(counts({ weighIns: 0, latestWeighIn: null }), TODAY)).toBe('No weigh-ins in these days.');
    expect(weightLine(counts({ weighIns: 2, latestWeighIn: { lbs: 70, date: '2026-10-27' } }), TODAY)).not.toMatch(/%|kg/);
  });

  it('the lead line names the sign in the owner word and why it leads', () => {
    expect(leadLine(counts())).toBe('Leads the report: vomiting, the first flag’s sign.');
    expect(leadLine(counts({ lead: { sign: 'intake', reason: 'flag' } }))).toBe('Leads the report: eating, the first flag’s sign.');
    expect(leadLine(counts({ lead: null }))).toBeNull();
  });

  it('a window with no symptom entry gets the empty note; a short one the thin note; never both', () => {
    expect(composerNoteOf(counts({ symptomEntries: 0 }))).toBe('empty');
    expect(composerNoteOf(counts({ windowDays: THIN_RECORD_DAYS - 1 }))).toBe('thin');
    expect(composerNoteOf(counts({ windowDays: THIN_RECORD_DAYS }))).toBeNull();
    expect(composerNoteOf(counts({ symptomEntries: 0, windowDays: 4 }))).toBe('empty');
  });

  it('b4 names what the dates leave out, and that the flags still print', () => {
    const after = { startDate: '2026-10-21', endDate: TODAY, symptomEntries: 8, byType: [
      { type: 'vomit', count: 6 }, { type: 'cough', count: 1 }, { type: 'sneeze', count: 1 },
    ] };
    expect(afterDisclosure(after, '2026-10-20', TODAY, true)).toBe(
      'Left out by these dates: 8 symptom entries after Oct 20 (6 vomiting, 1 coughing, 1 sneezing), and everything ' +
        `logged after Oct 20, up to today. The flags above still print: they come from the last ${LIVE_FLAG_DAYS} days, whatever the dates.`,
    );
    const none = { ...after, symptomEntries: 0, byType: [] };
    expect(afterDisclosure(none, '2026-10-20', TODAY, false)).toBe('Left out by these dates: everything logged after Oct 20, up to today.');
  });

  it('no owner string carries an exclamation mark or a percentage', () => {
    const all = [
      coverageLine(counts()),
      weightLine(counts(), TODAY),
      leadLine(counts()),
      COUNTS_INCOMPLETE_LINE,
      liveCardCopy(live(), 'Nyx')?.title,
      liveCardCopy(live(), 'Nyx')?.body,
      liveCardCopy(live({ state: 'incomplete', flags: [] }), 'Nyx')?.body,
    ].join(' ');
    expect(all).not.toMatch(/!|%/);
  });
});

describe('the live-flag card', () => {
  it('names the record’s pet and each flag once, in plain words', () => {
    const c = liveCardCopy(live(), 'Nyx');
    expect(c?.title).toBe('Nyx’s report has flags worth a call to your vet');
    expect(c?.body).toBe(`Possible foreign material in vomit and a lot of vomiting this week, in the last ${LIVE_FLAG_DAYS} days.`);
  });

  it('one flag reads singular', () => {
    expect(liveCardCopy(live({ flags: [{ kind: 'weight_loss', sign: null }] }), 'Nyx')?.title).toBe(
      'Nyx’s report has a flag worth a call to your vet',
    );
  });

  it('a flag kind this build has never heard of is still a flag on the card', () => {
    expect(liveCardCopy(live({ flags: [{ kind: 'something_new', sign: null }] }), 'Nyx')?.body).toMatch(/^Another finding/);
  });

  it('no flag is no card, never an all clear', () => {
    expect(liveCardCopy(live({ state: 'none', flags: [] }), 'Nyx')).toBeNull();
  });

  it('a short read says it could not check, and points at the vet', () => {
    const c = liveCardCopy(live({ state: 'incomplete', flags: [] }), 'Nyx');
    expect(c?.title).toBe('Couldn’t check Nyx’s record for flags');
    expect(c?.body).toMatch(/your vet is the best call/);
  });

  it('a blank name falls back to "your pet"', () => {
    expect(liveCardCopy(live(), '  ')?.title).toBe('Your pet’s report has flags worth a call to your vet');
  });
});

describe('parsing the server payload', () => {
  const wire = {
    composer: {
      today: TODAY,
      petName: 'Nyx',
      live: live(),
      windows: [
        { kind: 'since_visit', startDate: '2026-09-16', endDate: TODAY, days: 46 },
        { kind: 'nonsense', startDate: '2026-09-16', endDate: TODAY, days: 46 },
      ],
      counts: counts(),
      after: null,
    },
  };

  it('reads a well-formed open payload and drops a window kind it does not know', () => {
    const o = parseComposerOpen(wire);
    expect(o.windows.map((w) => w.kind)).toEqual(['since_visit']);
    expect(o.counts.symptomEntries).toBe(24);
    expect(o.live.state).toBe('flags');
  });

  it('refuses a payload it cannot vouch for rather than painting a guess', () => {
    expect(() => parseComposerOpen({})).toThrow();
    expect(() => parseComposerOpen({ composer: { ...wire.composer, windows: [] } })).toThrow();
    expect(() => parseComposerOpen({ composer: { ...wire.composer, counts: { startDate: TODAY } } })).toThrow();
    expect(() => parseComposerWindow({ composer: { counts: null } })).toThrow();
  });

  it('flags win over a claimed state; an unknown state with none reads as unchecked, never none', () => {
    expect(parseComposerOpen({ composer: { ...wire.composer, live: { ...live(), state: 'none' } } }).live.state).toBe('flags');
    expect(
      parseComposerOpen({ composer: { ...wire.composer, live: { ...live(), state: 'weird', flags: [] } } }).live.state,
    ).toBe('incomplete');
  });

  it('counts the server did not vouch for as whole read as incomplete', () => {
    const { incomplete: _drop, ...rest } = counts();
    expect(parseComposerWindow({ composer: { counts: rest, after: null } }).counts.incomplete).toBe(true);
  });

  it('the after total is the sum of its breakdown, whatever total arrived', () => {
    const r = parseComposerWindow({
      composer: { counts: counts(), after: { startDate: '2026-10-21', endDate: TODAY, symptomEntries: 99, byType: [{ type: 'vomit', count: 2 }] } },
    });
    expect(r.after?.symptomEntries).toBe(2);
  });
});

describe('newest request wins (GAP-14)', () => {
  it('only the latest stamp may land', () => {
    const latch = createRequestLatch();
    const a = latch.next();
    const b = latch.next();
    expect(latch.isCurrent(a)).toBe(false);
    expect(latch.isCurrent(b)).toBe(true);
  });
});

describe('the range calendar', () => {
  it('lays a month out Sunday first, padded to whole weeks', () => {
    const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(oct[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(oct.every((w) => w.length === 7)).toBe(true);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
  });

  it('two taps make a range in either order; a third starts again; a future day is never taken', () => {
    let r = nextRange({ start: null, end: null }, '2026-10-20', TODAY);
    expect(r).toEqual({ start: '2026-10-20', end: null });
    r = nextRange(r, '2026-10-01', TODAY);
    expect(r).toEqual({ start: '2026-10-01', end: '2026-10-20' });
    r = nextRange(r, '2026-10-05', TODAY);
    expect(r).toEqual({ start: '2026-10-05', end: null });
    expect(nextRange(r, '2026-11-02', TODAY)).toBe(r);
  });

  it('the footer names the range and its days', () => {
    expect(rangeFooter('2026-10-01', '2026-10-20', TODAY)).toBe('Oct 1 to Oct 20 · 20 days');
    expect(rangeFooter('2026-10-01', '2026-10-01', TODAY)).toBe('Oct 1 · 1 day');
  });
});
