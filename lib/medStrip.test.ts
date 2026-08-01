// The oracle for the Home medication strip resolver (B-614 PR M1).
//
// M1 is shared `lib/` logic, so unit tests are MANDATORY (DoD). This file pins the
// §11 acceptance criteria against the resolver's OUTPUT — most importantly AC #4,
// which the spec requires be enforced by a test rather than by review: the words
// "missed" and "due" appear NOWHERE in any rendered string, across every state.
//
// M5 has locked the copy (nyx-voice + clinical-guardrails), so the string
// assertions now pin the FINAL phrasing where a state's exact words matter — the
// collapsed "logged today" legibility, the recency time, the withholding register —
// and STRUCTURE elsewhere (which fact renders in which state, the banned words, the
// counts). A change that reintroduces "missed"/"due", drops a fact, or regresses the
// register turns them red, which is the point.
import {
  resolveMedStrips,
  medStripWithholdingReasons,
  isMedCadenceCoveredToday,
  MED_STRIP_ADHOC_WINDOW_DAYS,
  type MedStripInput,
  type MedStripModel,
  type MedStripRegimenRow,
  type MedStripDoseRow,
  type MedStripItem,
} from './medStrip';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// A fixed instant + an explicit zone so day math is deterministic and clock-free.
const NOW = Date.parse('2026-07-31T18:00:00.000Z'); // 2026-07-31, 18:00 UTC
const TZ = 'UTC';

const ITEM_AMOX = 'item-amox';
const ITEM_PRED = 'item-pred';
const ITEM_GABA = 'item-gaba';

const ITEMS: Record<string, MedStripItem> = {
  [ITEM_AMOX]: { generic_name: 'Amoxicillin', brand_name: null },
  [ITEM_PRED]: { generic_name: 'Prednisone', brand_name: null },
  [ITEM_GABA]: { generic_name: 'Gabapentin', brand_name: null },
};

function regimen(over: Partial<MedStripRegimenRow> = {}): MedStripRegimenRow {
  return {
    id: 'reg-amox',
    medication_item_id: ITEM_AMOX,
    drug_name: 'Amoxicillin',
    dose_amount: '250 mg',
    doses_per_day: 2,
    started_at: '2026-07-27', // day 5 of 14 at NOW (UTC)
    target_duration_days: 14,
    ...over,
  };
}

function dose(over: Partial<MedStripDoseRow> = {}): MedStripDoseRow {
  return {
    medication_id: null,
    medication_item_id: ITEM_AMOX,
    adherence: 'given',
    dose_amount: '250 mg',
    paired_event_id: null,
    paired_vehicle_intake: null,
    occurred_at: '2026-07-31T09:00:00.000Z', // today (UTC)
    deleted_at: null,
    ...over,
  };
}

function run(over: Partial<MedStripInput> = {}): MedStripModel[] {
  return resolveMedStrips({
    petId: 'pet-1',
    regimens: [],
    doses: [],
    items: ITEMS,
    nowMs: NOW,
    timeZone: TZ,
    ...over,
  });
}

// Every owner-facing string on a model, for the banned-word sweep.
function strings(m: MedStripModel): string[] {
  return [m.header, m.line].filter((s): s is string => s != null);
}

// ── AC #1 — durationed regimen: day-progress bar, no dose-derived term ─────────
describe('AC1 — a durationed regimen renders a day-progress bar', () => {
  test('bar fraction is daysElapsed / target_duration_days', () => {
    const models = run({ regimens: [regimen()] });
    expect(models).toHaveLength(1);
    expect(models[0].header).toBe('Amoxicillin · day 5 of 14');
    expect(models[0].progressFraction).toBeCloseTo(5 / 14);
  });

  test('the bar is day progress only — logging doses never moves it (N2)', () => {
    const none = run({ regimens: [regimen()] })[0];
    const one = run({ regimens: [regimen()], doses: [dose()] })[0];
    expect(one.progressFraction).toBe(none.progressFraction);
    expect(one.progressFraction).toBeCloseTo(5 / 14);
  });

  test('a course at/over length reads a full bar, never > 1', () => {
    const reached = run({ regimens: [regimen({ started_at: '2026-07-18' })] })[0]; // day 14
    expect(reached.progressFraction).toBe(1);
    const past = run({ regimens: [regimen({ started_at: '2026-07-15' })] })[0]; // day 17
    expect(past.progressFraction).toBe(1);
  });
});

// ── AC #2 — ad-hoc-only med renders (D2) ──────────────────────────────────────
describe('AC2 — an ad-hoc-only med (recent dose, no regimen) renders a card', () => {
  test('renders with a name, no bar, and a button (attributable via item id)', () => {
    const models = run({
      doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-29T10:00:00.000Z' })],
    });
    expect(models).toHaveLength(1);
    expect(models[0].header).toBe('Prednisone');
    expect(models[0].progressFraction).toBeNull();
    expect(models[0].confirm).not.toBeNull();
    expect(models[0].confirm?.medicationItemId).toBe(ITEM_PRED);
    expect(models[0].confirm?.medicationId).toBeNull();
    // The confirm carries the loaded pet id (bound to the drug identity so a one-tap
    // write can't cross pets on a switch); `drugName` is the bare name for the label.
    expect(models[0].confirm?.petId).toBe('pet-1');
    expect(models[0].drugName).toBe('Prednisone');
  });

  test('a dose exactly at the window edge counts; one day older ages off Home', () => {
    // 14 days before 2026-07-31 is 2026-07-17 (inclusive); 2026-07-16 is out.
    const edge = run({ doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-17T09:00:00.000Z' })] });
    expect(edge).toHaveLength(1);
    const stale = run({ doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-16T09:00:00.000Z' })] });
    expect(stale).toHaveLength(0);
  });

  test('an ad-hoc dose with no drug identity renders nothing (no-garbage rule)', () => {
    expect(run({ doses: [dose({ medication_item_id: null, occurred_at: '2026-07-31T09:00:00.000Z' })] })).toEqual([]);
  });
});

// ── AC #3 — no meds → nothing ─────────────────────────────────────────────────
describe('AC3 — a pet with no meds renders nothing (no hole on Home)', () => {
  test('empty input → empty array', () => {
    expect(run()).toEqual([]);
  });
  test('a soft-deleted-only ad-hoc med renders nothing', () => {
    expect(run({ doses: [dose({ medication_item_id: ITEM_PRED, deleted_at: '2026-07-31T10:00:00.000Z' })] })).toEqual([]);
  });
});

// ── AC #4 — "missed" and "due" appear NOWHERE (N1) ────────────────────────────
describe('AC4 — the banned words never appear in rendered output', () => {
  // One input per §9 state, so the sweep sees every phrasing the resolver can emit.
  const cases: { name: string; input: Partial<MedStripInput> }[] = [
    { name: 'state 1 (course, today open)', input: { regimens: [regimen()] } },
    { name: 'state 2 (course, partly covered)', input: { regimens: [regimen()], doses: [dose()] } },
    { name: 'state 3 (course, covered → collapsed)', input: { regimens: [regimen()], doses: [dose(), dose()] } },
    {
      name: 'state 4 (ongoing)',
      input: {
        regimens: [regimen({ id: 'reg-gaba', medication_item_id: ITEM_GABA, drug_name: 'Gabapentin', doses_per_day: 3, target_duration_days: null })],
        doses: [dose({ medication_item_id: ITEM_GABA, occurred_at: '2026-07-30T21:00:00.000Z' })],
      },
    },
    { name: 'state 5 (ad-hoc)', input: { doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-29T19:00:00.000Z' })] } },
    { name: 'state 6 (course length reached)', input: { regimens: [regimen({ started_at: '2026-07-18' })] } },
    { name: 'state 7 (past course length)', input: { regimens: [regimen({ started_at: '2026-07-15' })] } },
    { name: 'state 8 (withholding — refused)', input: { regimens: [regimen()], doses: [dose({ adherence: 'refused' })] } },
    { name: 'state 8 (withholding — missed adherence)', input: { regimens: [regimen()], doses: [dose({ adherence: 'missed' })] } },
    { name: 'state 8 (withholding — intake decline)', input: { regimens: [regimen()], intakeDeclineActive: true } },
  ];

  test.each(cases)('$name has no "missed" / "due"', ({ input }) => {
    const models = run(input);
    for (const m of models) {
      for (const s of strings(m)) {
        expect(s).not.toMatch(/\bmissed\b/i);
        expect(s).not.toMatch(/\bdue\b/i);
      }
    }
  });

  test('an owner-logged missed dose still withholds, phrased without "missed"', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'missed' })] })[0];
    expect(m.withholding).toContain('missed_dose');
    expect(m.line).not.toBeNull();
    expect(m.line).not.toMatch(/\bmissed\b/i);
  });
});

// ── AC #5 — a refused/missed/in-doubt dose suppresses the line AND the button ──
describe('AC5 — a withholding record suppresses the coverage line and the button', () => {
  test('a refused dose: no button, and the fact replaces coverage (N3)', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })] })[0];
    expect(m.withholding).toEqual(['refused_dose']);
    expect(m.confirm).toBeNull();
    expect(m.line).toMatch(/refused/i);
    expect(m.line).not.toMatch(/logged today/); // not a cheery coverage line
  });

  test('an in-doubt combo dose (vehicle refused, adherence null) withholds', () => {
    const m = run({
      regimens: [regimen()],
      doses: [dose({ adherence: null, paired_event_id: 'meal-1', paired_vehicle_intake: 'refused' })],
    })[0];
    expect(m.withholding).toContain('dose_in_doubt');
    expect(m.confirm).toBeNull();
  });

  test('a live intake-decline flag withholds and defers its line to the Signal card', () => {
    const m = run({ regimens: [regimen()], intakeDeclineActive: true })[0];
    expect(m.withholding).toEqual(['intake_decline']);
    expect(m.confirm).toBeNull();
    expect(m.line).toBeNull(); // the pet-level fact is owned by SignalZone above
    expect(m.progressFraction).toBeCloseTo(5 / 14); // day context still renders
  });

  test('a withholding med never collapses, even when covered today (N3)', () => {
    const m = run({ regimens: [regimen()], doses: [dose(), dose(), dose({ adherence: 'refused' })] })[0];
    expect(m.collapsed).toBe(false);
    expect(m.confirm).toBeNull();
  });

  test('a med-specific fact shows even alongside a pet-level intake decline', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })], intakeDeclineActive: true })[0];
    expect(m.withholding).toEqual(expect.arrayContaining(['refused_dose', 'intake_decline']));
    expect(m.line).toMatch(/refused/i); // the med's own news is not swallowed
  });

  // M5 RULING (past-length + refused composition): on a course that is BOTH past
  // its length (states 6/7) AND carries a refused dose (state 8), BOTH facts render
  // — the overrun in the HEADER, the refusal in the LINE — and the calendar advisory
  // string is subsumed, not lost: its action (check the vet) survives via the button
  // standing down + the tap-through. So the line is the refusal alone, and nothing is
  // dropped. Pinned so the register call stays a decision.
  test('a past-length course with a refused dose: overrun in the header, refusal in the line', () => {
    const m = run({ regimens: [regimen({ started_at: '2026-07-15' })], doses: [dose({ adherence: 'refused' })] })[0]; // day 17 of 14
    expect(m.header).toContain('3 days past'); // the overrun fact lives in the header
    expect(m.line).toBe('Last dose refused'); // the health signal takes the single line
    expect(m.line).not.toMatch(/course length|vet/i); // the advisory string yields
    expect(m.confirm).toBeNull(); // withholding stands the button down
  });
});

// ── AC #6 — the confirmability gate ───────────────────────────────────────────
describe('AC6 — the button renders only when the app can describe the row', () => {
  test('a free-text regimen (no item id) is confirmable via medicationId', () => {
    const m = run({ regimens: [regimen({ medication_item_id: null, drug_name: 'Compounded thing' })] })[0];
    expect(m.header).toContain('Compounded thing');
    expect(m.confirm).not.toBeNull();
    expect(m.confirm?.medicationItemId).toBeNull();
    expect(m.confirm?.medicationId).toBe('reg-amox');
  });

  test('INVARIANT: whenever a button renders, at least one identity is present', () => {
    // The gate's real content ("no attributable identity → no button") as its
    // contrapositive, asserted across every state the resolver can emit.
    const inputs: Partial<MedStripInput>[] = [
      { regimens: [regimen()] },
      { regimens: [regimen({ target_duration_days: null })] },
      { doses: [dose({ medication_item_id: ITEM_PRED })] },
      { regimens: [regimen({ medication_item_id: null })] },
      { regimens: [regimen({ started_at: '2026-07-15' })] },
    ];
    for (const input of inputs) {
      for (const m of run(input)) {
        if (m.confirm !== null) {
          expect(m.confirm.medicationItemId != null || m.confirm.medicationId != null).toBe(true);
        }
      }
    }
  });

  test('D5 — doseAmount is honest-null: regimen amount, else last dose, else null', () => {
    // Regimen supplies its own amount.
    const fromReg = run({ regimens: [regimen({ dose_amount: '250 mg' })] })[0];
    expect(fromReg.confirm?.doseAmount).toBe('250 mg');
    // Ad-hoc: inherit the last dose's amount.
    const fromLast = run({ doses: [dose({ medication_item_id: ITEM_PRED, dose_amount: '5 mg', occurred_at: '2026-07-30T08:00:00.000Z' })] })[0];
    expect(fromLast.confirm?.doseAmount).toBe('5 mg');
    // Nothing to default from → null, never a fabricated amount.
    const nulled = run({ doses: [dose({ medication_item_id: ITEM_PRED, dose_amount: null, occurred_at: '2026-07-30T08:00:00.000Z' })] })[0];
    expect(nulled.confirm?.doseAmount).toBeNull();
  });
});

// ── AC #7 — the collapse rule (§7) ────────────────────────────────────────────
describe('AC7 — a covered cadence collapses; PRN never collapses', () => {
  test('doses_per_day met today → collapsed, one line, no bar, no button', () => {
    const m = run({ regimens: [regimen()], doses: [dose(), dose()] })[0]; // 2 of 2
    expect(m.collapsed).toBe(true);
    // M5 legibility — the count reads as TODAY's cadence met, not a lifetime tally.
    expect(m.header).toBe('Amoxicillin · day 5 of 14 · 2 doses logged today');
    expect(m.line).toBeNull();
    expect(m.progressFraction).toBeNull();
    expect(m.confirm).toBeNull();
  });

  test('partly covered → NOT collapsed, keeps its bar and button', () => {
    const m = run({ regimens: [regimen()], doses: [dose()] })[0]; // 1 of 2
    expect(m.collapsed).toBe(false);
    expect(m.line).toBe('1 of 2 doses logged today');
    expect(m.confirm).not.toBeNull();
  });

  test('a PRN regimen (doses_per_day null) never collapses, even with doses today', () => {
    const m = run({ regimens: [regimen({ doses_per_day: null, target_duration_days: null })], doses: [dose(), dose(), dose()] })[0];
    expect(m.collapsed).toBe(false);
    expect(m.confirm).not.toBeNull();
  });

  test('a course at/over length does not collapse — the advisory always shows', () => {
    const m = run({ regimens: [regimen({ started_at: '2026-07-18' })], doses: [dose(), dose()] })[0]; // day 14, covered
    expect(m.collapsed).toBe(false);
    expect(m.line).toMatch(/course length reached/i);
    expect(m.confirm).not.toBeNull();
  });

  test('the exported predicate: PRN → false, unmet → false, met → true', () => {
    expect(isMedCadenceCoveredToday({ dosesPerDay: null, dosesLoggedToday: 5 })).toBe(false);
    expect(isMedCadenceCoveredToday({ dosesPerDay: 0, dosesLoggedToday: 5 })).toBe(false);
    expect(isMedCadenceCoveredToday({ dosesPerDay: 2, dosesLoggedToday: 1 })).toBe(false);
    expect(isMedCadenceCoveredToday({ dosesPerDay: 2, dosesLoggedToday: 2 })).toBe(true);
    expect(isMedCadenceCoveredToday({ dosesPerDay: 0.5, dosesLoggedToday: 1 })).toBe(true);
  });
});

// ── AC #8 — day counters agree across zones and DST ───────────────────────────
describe('AC8 — the day counter is zone- and DST-correct (M0/B-441)', () => {
  const started = '2026-06-13';
  test('a device behind UTC and one ahead of UTC read the same day near midnight', () => {
    // 2026-06-15, 06:30 in UTC−7 is still the 15th → day 3. In UTC+11 the same
    // instant is the 15th too. The bug B-441 fixed made the behind-UTC device read 4.
    const minus7 = resolveMedStrips({
      regimens: [regimen({ started_at: started, target_duration_days: 30 })],
      petId: 'pet-1', doses: [], items: ITEMS, nowMs: Date.parse('2026-06-15T13:30:00.000Z'), timeZone: 'Etc/GMT+7',
    });
    const plus11 = resolveMedStrips({
      regimens: [regimen({ started_at: started, target_duration_days: 30 })],
      petId: 'pet-1', doses: [], items: ITEMS, nowMs: Date.parse('2026-06-15T02:00:00.000Z'), timeZone: 'Etc/GMT-11',
    });
    expect(minus7[0].header).toBe('Amoxicillin · day 3 of 30');
    expect(plus11[0].header).toBe('Amoxicillin · day 3 of 30');
  });

  test('00:30 and 23:30 local land on the same local day', () => {
    // Etc/GMT+7 = UTC−7. 2026-06-15 00:30 local = 07:30Z; 23:30 local = 2026-06-16 06:30Z.
    const early = resolveMedStrips({
      regimens: [regimen({ started_at: started, target_duration_days: 30 })],
      petId: 'pet-1', doses: [], items: ITEMS, nowMs: Date.parse('2026-06-15T07:30:00.000Z'), timeZone: 'Etc/GMT+7',
    });
    const late = resolveMedStrips({
      regimens: [regimen({ started_at: started, target_duration_days: 30 })],
      petId: 'pet-1', doses: [], items: ITEMS, nowMs: Date.parse('2026-06-16T06:30:00.000Z'), timeZone: 'Etc/GMT+7',
    });
    expect(early[0].header).toBe('Amoxicillin · day 3 of 30');
    expect(late[0].header).toBe('Amoxicillin · day 3 of 30');
  });
});

// ── AC #10 — soft-deleted doses never count ───────────────────────────────────
describe('AC10 — a soft-deleted dose never counts toward coverage or collapse', () => {
  test('two doses today, one soft-deleted → 1 of 2, not collapsed', () => {
    const m = run({ regimens: [regimen()], doses: [dose(), dose({ deleted_at: '2026-07-31T12:00:00.000Z' })] })[0];
    expect(m.collapsed).toBe(false);
    expect(m.line).toBe('1 of 2 doses logged today');
  });

  test('a soft-deleted refused dose does not withhold', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'refused', deleted_at: '2026-07-31T12:00:00.000Z' })] })[0];
    expect(m.withholding).toEqual([]);
    expect(m.confirm).not.toBeNull();
  });
});

// ── Dedup (§4.2) — one card when a drug has both a regimen and ad-hoc doses ────
describe('deduplication — one card per drug (D3), keyed on the item', () => {
  test('a regimen + an ad-hoc dose of the same drug render ONE card, regimen header', () => {
    const models = run({
      regimens: [regimen()],
      doses: [dose({ medication_id: null, occurred_at: '2026-07-31T09:00:00.000Z' })], // ad-hoc, same item
    });
    expect(models).toHaveLength(1);
    expect(models[0].header).toContain('day 5 of 14'); // the regimen supplies the header
    expect(models[0].line).toBe('1 of 2 doses logged today'); // the ad-hoc dose counts toward coverage
  });

  test('two active regimens for one drug keep the most-recently-started', () => {
    const models = run({
      regimens: [
        regimen({ id: 'older', started_at: '2026-07-20', target_duration_days: 30 }),
        regimen({ id: 'newer', started_at: '2026-07-29', target_duration_days: 10 }),
      ],
    });
    expect(models).toHaveLength(1);
    expect(models[0].confirm?.medicationId).toBe('newer');
    expect(models[0].header).toContain('of 10'); // the newer regimen's target
  });

  test('two DIFFERENT drugs render two cards', () => {
    const models = run({
      regimens: [regimen()],
      doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-29T10:00:00.000Z' })],
    });
    expect(models).toHaveLength(2);
  });
});

// ── Ordering (D8) — expanded before collapsed, then oldest, then name ─────────
describe('ordering (D8) — stable, non-clinical', () => {
  test('expanded cards sort before collapsed ones', () => {
    const models = run({
      regimens: [
        regimen({ id: 'reg-amox', medication_item_id: ITEM_AMOX, started_at: '2026-07-20' }), // expanded (0 today)
        regimen({ id: 'reg-gaba', medication_item_id: ITEM_GABA, drug_name: 'Gabapentin', started_at: '2026-07-10', doses_per_day: 1, target_duration_days: 30 }),
      ],
      doses: [dose({ medication_item_id: ITEM_GABA })], // covers Gabapentin (1/day) → collapsed
    });
    expect(models.map((m) => m.collapsed)).toEqual([false, true]);
    expect(models[0].header).toContain('Amoxicillin');
    expect(models[1].header).toContain('Gabapentin');
  });

  test('within a collapse group, the oldest course sorts first', () => {
    const models = run({
      regimens: [
        regimen({ id: 'reg-gaba', medication_item_id: ITEM_GABA, drug_name: 'Gabapentin', started_at: '2026-07-25' }),
        regimen({ id: 'reg-amox', medication_item_id: ITEM_AMOX, started_at: '2026-07-20' }),
      ],
    });
    expect(models[0].header).toContain('Amoxicillin'); // started 07-20, older
    expect(models[1].header).toContain('Gabapentin'); // started 07-25
  });
});

// ── medStripWithholdingReasons (exported, §6) ─────────────────────────────────
describe('medStripWithholdingReasons — the one list both surfaces read', () => {
  test('names every reason the record carries', () => {
    const reasons = medStripWithholdingReasons({
      recentDoses: [
        { adherence: 'refused', paired_event_id: null, paired_vehicle_intake: null },
        { adherence: 'missed', paired_event_id: null, paired_vehicle_intake: null },
        { adherence: null, paired_event_id: 'm1', paired_vehicle_intake: 'picked' },
      ],
      intakeDeclineActive: true,
    });
    expect(reasons).toEqual(expect.arrayContaining(['refused_dose', 'missed_dose', 'dose_in_doubt', 'intake_decline']));
  });

  test('a clean recent record with no decline flag → no reasons', () => {
    expect(
      medStripWithholdingReasons({
        recentDoses: [
          { adherence: 'given', paired_event_id: null, paired_vehicle_intake: null },
          { adherence: 'partial', paired_event_id: null, paired_vehicle_intake: null },
        ],
        intakeDeclineActive: false,
      }),
    ).toEqual([]);
  });

  test('a finished-vehicle combo dose is NOT in doubt (reuses the shipped predicate)', () => {
    expect(
      medStripWithholdingReasons({
        recentDoses: [{ adherence: null, paired_event_id: 'm1', paired_vehicle_intake: 'all' }],
        intakeDeclineActive: false,
      }),
    ).toEqual([]);
  });
});

// ── M5 — the withholding LINE register (clinical-guardrails) ──────────────────
// The one place M5 makes a clinical-copy call: how a withholding record READS.
// Presence still gates whether it speaks (unchanged from M1, so no threshold and no
// adversarial gate); this pins WHAT it prints.
describe('M5 — the withholding line reads clean at n=1 and composes at n>1', () => {
  test('a single recent refused dose reads "Last dose refused", not "1 of the last 1 dose refused"', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'refused' })] })[0];
    expect(m.line).toBe('Last dose refused');
  });

  test('a single recent not-given dose reads "Last dose not given" — never the word "missed"', () => {
    const m = run({ regimens: [regimen()], doses: [dose({ adherence: 'missed' })] })[0];
    expect(m.line).toBe('Last dose not given');
    expect(m.line).not.toMatch(/\bmissed\b/i);
  });

  test('several recent doses, some refused → "N of the last M doses refused"', () => {
    // 5 recent doses (4 given + 1 refused) → n=5, refused=1.
    const doses = [
      dose({ occurred_at: '2026-07-27T09:00:00.000Z' }),
      dose({ occurred_at: '2026-07-28T09:00:00.000Z' }),
      dose({ occurred_at: '2026-07-29T09:00:00.000Z' }),
      dose({ occurred_at: '2026-07-30T09:00:00.000Z' }),
      dose({ adherence: 'refused', occurred_at: '2026-07-31T09:00:00.000Z' }),
    ];
    const m = run({ regimens: [regimen()], doses })[0];
    expect(m.line).toBe('1 of the last 5 doses refused');
  });

  test('a compound record leads with refused and appends the rest as bare counts', () => {
    // 4 recent doses: 1 refused, 1 not-given (missed), 2 given → n=4.
    const doses = [
      dose({ adherence: 'refused', occurred_at: '2026-07-29T09:00:00.000Z' }),
      dose({ adherence: 'missed', occurred_at: '2026-07-30T09:00:00.000Z' }),
      dose({ occurred_at: '2026-07-31T08:00:00.000Z' }),
      dose({ occurred_at: '2026-07-31T09:00:00.000Z' }),
    ];
    const m = run({ regimens: [regimen()], doses })[0];
    // Refused leads (the sharpest signal) and carries the "of the last N" frame; the
    // not-given appends as a bare count. Still no "missed", no "due" (N1).
    expect(m.line).toBe('1 of the last 4 doses refused · 1 not given');
    expect(m.line).not.toMatch(/\bmissed\b/i);
    expect(m.line).not.toMatch(/\bdue\b/i);
  });
});

// ── Recency / ongoing lines ───────────────────────────────────────────────────
describe('recency framing for ongoing + ad-hoc meds', () => {
  test('an ongoing regimen, no dose today, shows a last-dose line', () => {
    const m = run({
      regimens: [regimen({ id: 'reg-gaba', medication_item_id: ITEM_GABA, drug_name: 'Gabapentin', doses_per_day: 3, target_duration_days: null })],
      doses: [dose({ medication_item_id: ITEM_GABA, occurred_at: '2026-07-30T21:00:00.000Z' })],
    })[0];
    expect(m.header).toBe('Gabapentin · ongoing');
    // M5 — the recency line carries the clock time (7:00/9:00 PM etc.), tz-pinned.
    expect(m.line).toBe('Last dose yesterday, 9:00 PM');
    expect(m.confirm).not.toBeNull();
  });

  test('an ad-hoc med leads with its last dose, then the window count (>1)', () => {
    const m = run({
      doses: [
        dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-30T19:00:00.000Z' }), // yesterday 7pm
        dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-25T19:00:00.000Z' }),
      ],
    })[0];
    expect(m.header).toBe('Prednisone');
    expect(m.line).toBe(`Last dose yesterday, 7:00 PM · 2 in the last ${MED_STRIP_ADHOC_WINDOW_DAYS} days`);
  });

  test('a lone ad-hoc dose reads just its last dose, no redundant "1 in the last…" tail', () => {
    const m = run({
      doses: [dose({ medication_item_id: ITEM_PRED, occurred_at: '2026-07-29T15:00:00.000Z' })], // Jul 29, 3pm
    })[0];
    expect(m.line).toBe('Last dose Jul 29, 3:00 PM');
  });

  test('an ongoing med dosed earlier today reads "Last dose today, <time>"', () => {
    // doses_per_day 3, one dose today → not covered → recency line, "today" branch.
    const m = run({
      regimens: [regimen({ id: 'reg-gaba', medication_item_id: ITEM_GABA, drug_name: 'Gabapentin', doses_per_day: 3, target_duration_days: null })],
      doses: [dose({ medication_item_id: ITEM_GABA, occurred_at: '2026-07-31T15:00:00.000Z' })],
    })[0];
    expect(m.line).toBe('Last dose today, 3:00 PM');
    expect(m.collapsed).toBe(false);
  });
});

// ── State 1 coverage line ─────────────────────────────────────────────────────
describe('state 1 — a fixed course with today still open', () => {
  test('names the record and the usual frequency in plain words, never "due"', () => {
    const m = run({ regimens: [regimen()] })[0]; // doses_per_day 2
    expect(m.line).toBe('No dose logged yet today · usually twice a day');
    expect(m.confirm).not.toBeNull();
  });

  // M5 nyx-voice — plain words for the common rates ("2×/day" reads as clinical
  // shorthand beside "once a day"); the compact "N×/day" is the fallback only for 4+.
  test('the frequency hint reads in plain words for 1–3, and falls back to N×/day for 4+', () => {
    const hintFor = (dpd: number) =>
      run({ regimens: [regimen({ doses_per_day: dpd })] })[0].line;
    expect(hintFor(1)).toBe('No dose logged yet today · usually once a day');
    expect(hintFor(3)).toBe('No dose logged yet today · usually three times a day');
    expect(hintFor(4)).toBe('No dose logged yet today · usually 4×/day');
    // A fractional rate carries no hint rather than reading "usually 0.5×/day".
    expect(run({ regimens: [regimen({ doses_per_day: 1.5 })] })[0].line).toBe(
      'No dose logged yet today',
    );
  });
});

// ── Durationed course with NO daily cadence (target set, doses_per_day null) ───
// A "for 14 days, as needed" regimen: it never collapses (PRN) and has a day bar
// (targetDays set), but the coverage line must NOT fabricate an "N of N" denominator
// that reads as a met target (soft N4). It states the count only.
describe('a durationed PRN course states the count, never a fabricated "N of N"', () => {
  const durationedPrn = regimen({ doses_per_day: null, target_duration_days: 14 });

  test('with a dose today: "N doses logged today", no invented denominator', () => {
    const m = run({ regimens: [durationedPrn], doses: [dose(), dose()] })[0];
    expect(m.collapsed).toBe(false); // PRN never collapses
    expect(m.line).toBe('2 doses logged today');
    expect(m.line).not.toMatch(/of 2/); // never "2 of 2"
    expect(m.progressFraction).toBeCloseTo(5 / 14); // the day bar still renders
  });

  test('one dose today reads singular', () => {
    const m = run({ regimens: [durationedPrn], doses: [dose()] })[0];
    expect(m.line).toBe('1 dose logged today');
  });

  test('nothing logged today still reads the open-state line (no hint, PRN)', () => {
    const m = run({ regimens: [durationedPrn] })[0];
    expect(m.line).toBe('No dose logged yet today');
  });
});
