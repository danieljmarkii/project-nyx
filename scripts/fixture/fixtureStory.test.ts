// jest validation for the device-pass fixture (CUL-1222, GC-2). The Deno sibling
// (supabase/functions/generate-signal/fixtureStory.detection.test.ts) proves each pet's
// Signal leads as declared; this proves the rest of what the sitting leans on:
//   (a) the trial facts each trial pet is FOR, through the shipped lib/dietTrial
//       predicate (Juniper: past day 7, exactly one off-diet feeding, one refused bowl,
//       not a refusing patient; Miso: a refusing patient);
//   (b) the Noticed seed's vomit days and the story's copy of them are one list;
//   (c) the emitted SQL is upsert-only, transaction-wrapped, scoped behind its prelude,
//       and writes nothing the story says it never writes.
//
// B-514: every instant is UTC-anchored and computeTrialFacts is pinned to `timeZone: 'UTC'`,
// so the suite reads the same under the non-UTC CI zones.

jest.mock('../../lib/sync', () => ({ syncPendingEvents: jest.fn(), syncPendingLooks: jest.fn() }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));

import {
  computeTrialFacts,
  classifyFeeding,
  buildTrialContext,
  type TrialFeeding,
  type AllowedFood,
  type TrialSpec,
} from '../../lib/dietTrial';
import { foodIntakeKey } from '../../lib/food';
import { buildLookSeed } from '../../lib/lookDevSeed';
import { materializeDate, materializeInstantIso } from '../demo/demoStory';
import { buildFixtureStory, NOTICED_SEED_VOMIT_DAYS, trialDayNumber, type FixturePet } from './fixtureStory';
import { emitFixtureSqlForParams, emitFixtureSql } from './emitFixtureSql';
import { isFixtureEmail, FIXTURE_EMAIL_TAG } from '../../lib/deviceFixture';

const PARAMS = {
  userId: '33333333-3333-4333-8333-333333333333',
  timezone: 'America/New_York',
  email: 'owner+culprit-fixture@example.com',
};
const SEED_MS = Date.parse('2026-10-05T15:30:00.000Z');
const TZ = 'UTC';
const story = buildFixtureStory(PARAMS);
const pet = (key: FixturePet['key']): FixturePet => story.pets.find((p) => p.key === key)!;

function factsFor(p: FixturePet) {
  const t = p.trial!;
  const spec: TrialSpec = {
    id: t.id,
    startedAt: materializeDate(t.startedDayOffset, SEED_MS),
    targetDurationDays: t.targetDurationDays,
    transitionStartedAt: materializeDate(t.transitionStartedDayOffset, SEED_MS),
    endedAt: null,
    species: p.species,
  };
  const allowed: AllowedFood[] = [{
    foodItemId: t.food.id,
    foodKey: foodIntakeKey(t.food.brand, t.food.productName),
    label: t.food.label,
    role: 'primary_diet',
    allowedFrom: materializeDate(t.startedDayOffset, SEED_MS),
    allowedUntil: null,
    primaryProtein: t.food.primaryProtein,
    proteins: t.food.proteins,
  }];
  const feedings: TrialFeeding[] = p.events
    .filter((e) => e.meal)
    .map((e) => ({
      eventId: e.eventId,
      occurredAt: materializeInstantIso(e.time, SEED_MS),
      foodItemId: e.meal!.food.id,
      foodKey: foodIntakeKey(e.meal!.food.brand, e.meal!.food.productName),
      label: e.meal!.food.label,
      foodType: e.meal!.food.foodType,
      proteins: e.meal!.food.proteins,
      intakeRating: e.meal!.intakeRating,
    }));
  return {
    facts: computeTrialFacts({ trial: spec, allowedFoods: allowed, feedings, nowMs: SEED_MS, timeZone: TZ }),
    ctx: buildTrialContext(spec, allowed, { timeZone: TZ }),
    feedings,
    startMs: Date.parse(`${spec.startedAt}T00:00:00.000Z`),
  };
}

describe('fixture — Juniper, the running trial (CUL-1529 §E)', () => {
  const juniper = pet('juniper');
  const { facts, ctx, feedings, startMs } = factsFor(juniper);

  it('is past day 7', () => {
    expect(trialDayNumber(juniper.trial!)).toBe(22);
    expect(trialDayNumber(juniper.trial!)).toBeGreaterThan(7);
  });

  it('has exactly one off-diet feeding, the chicken jerky, inside the trial', () => {
    expect(facts.exposures.offDiet).toBe(1);
    const off = feedings.filter((f) => Date.parse(f.occurredAt) >= startMs && classifyFeeding(ctx, f).offDiet);
    expect(off.map((f) => f.label)).toEqual(['Backyard Chicken Jerky']);
  });

  it('has exactly one refused bowl inside the trial, and is not a refusing patient', () => {
    const refused = feedings.filter((f) => Date.parse(f.occurredAt) >= startMs && f.intakeRating === 'refused');
    expect(refused).toHaveLength(1);
    expect(facts.trialDietRefusal).toBeNull();
  });
});

describe('fixture — Miso, the refusing trial (CUL-1529 steps 17, 32, 42)', () => {
  const miso = pet('miso');
  const { facts } = factsFor(miso);

  it('is past day 7 and reads as a refusing patient on the trial screen', () => {
    expect(trialDayNumber(miso.trial!)).toBeGreaterThan(7);
    expect(facts.trialDietRefusal).not.toBeNull();
  });

  it('vomited less this week than last (the "down from" Home must not print for her)', () => {
    const days = miso.events.filter((e) => e.type === 'vomit').map((e) => -e.time.dayOffset);
    const thisWeek = days.filter((d) => d <= 6).length;
    const lastWeek = days.filter((d) => d >= 7 && d <= 13).length;
    expect(thisWeek).toBeLessThan(lastWeek);
  });
});

describe('fixture — Pepper, the long day and the Noticed seed', () => {
  const pepper = pet('pepper');

  it('the Noticed seed puts its vomits on exactly the days the story certifies', () => {
    for (const species of ['dog', 'cat'] as const) {
      const seeded = buildLookSeed(species).filter((d) => d.vomit).map((d) => d.daysAgo).sort((a, b) => a - b);
      expect(seeded).toEqual([...NOTICED_SEED_VOMIT_DAYS].sort((a, b) => a - b));
    }
  });

  it('carries a long record: 20+ rows on one day (CUL-1529 step 5)', () => {
    const byDay = new Map<number, number>();
    for (const e of pepper.events) byDay.set(e.time.dayOffset, (byDay.get(e.time.dayOffset) ?? 0) + 1);
    expect(Math.max(...byDay.values())).toBeGreaterThanOrEqual(20);
  });

  it('carries the grazer\'s day: 2 refused, 2 picked at, 1 some (step 28)', () => {
    const day = pepper.events.filter((e) => e.time.dayOffset === -6 && e.meal).map((e) => e.meal!.intakeRating);
    expect(day.length).toBeGreaterThanOrEqual(10);
    expect(day.filter((r) => r === 'refused')).toHaveLength(2);
    expect(day.filter((r) => r === 'picked')).toHaveLength(2);
    expect(day.filter((r) => r === 'some')).toHaveLength(1);
  });
});

describe('fixture — the story never writes a future row', () => {
  it('every instant is at or before the seed moment, at every hour of the day', () => {
    for (let h = 0; h < 24; h++) {
      const now = Date.parse('2026-10-05T00:00:00.000Z') + h * 3_600_000 + 6 * 60_000;
      for (const p of story.pets) {
        for (const e of p.events) {
          expect(Date.parse(materializeInstantIso(e.time, now))).toBeLessThanOrEqual(now);
        }
      }
    }
  });

  it('every row id is unique across the account', () => {
    const ids = story.pets.flatMap((p) => [p.id, ...p.events.map((e) => e.eventId), ...p.events.flatMap((e) => (e.meal ? [e.meal.mealId] : []))]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fixture — the account rule (lib/deviceFixture)', () => {
  it.each([
    ['owner+culprit-fixture@example.com', true],
    ['Owner+Culprit-Fixture@Example.com', true],
    ['owner@example.com', false],
    ['support@getculprit.app', false],
    ['+culprit-fixture@example.com', false],
    ['owner+culprit-fixture-2@example.com', false],
    ['owner+culprit-fixture@', false],
    ['', false],
  ])('%s → %s', (email, expected) => {
    expect(isFixtureEmail(email)).toBe(expected);
  });

  it('refuses null and undefined (a caller that cannot read the session fails closed)', () => {
    expect(isFixtureEmail(null)).toBe(false);
    expect(isFixtureEmail(undefined)).toBe(false);
  });
});

describe('fixture — emitted SQL safety', () => {
  const sql = emitFixtureSqlForParams(PARAMS);

  it('refuses to emit for an email that is not a fixture alias', () => {
    expect(() => emitFixtureSql(story, 'owner@example.com')).toThrow(/fixture alias/);
    expect(() => emitFixtureSql(story, 'support@getculprit.app')).toThrow(/fixture alias/);
  });

  it('is upsert-only: no DELETE, and every UPDATE is an ON CONFLICT DO UPDATE', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    const updates = sql.match(/\bUPDATE\b/gi) ?? [];
    const doUpdates = sql.match(/\bDO UPDATE\b/gi) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.length).toBe(doUpdates.length);
  });

  it('runs inside one transaction with the prelude before the first write', () => {
    const begin = sql.indexOf('BEGIN;');
    const prelude = sql.indexOf('DO $do$');
    const firstWrite = sql.indexOf('INSERT INTO');
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(prelude);
    expect(prelude).toBeLessThan(firstWrite);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('the prelude checks the id against the email, the alias tag, foreign pets and foreign ids', () => {
    const prelude = sql.slice(sql.indexOf('DO $do$'), sql.indexOf('$do$;') + 5);
    expect(prelude).toContain(`'${PARAMS.email}'`);
    expect(prelude).toContain(`FROM auth.users WHERE id = '${PARAMS.userId}'::uuid`);
    expect(prelude).toContain(`'${FIXTURE_EMAIL_TAG}'`);
    expect(prelude).toMatch(/user_id = '[^']+'::uuid AND id NOT IN \(/);
    expect(prelude).toMatch(/FROM pets WHERE id IN \([^)]+\) AND user_id IS DISTINCT FROM/);
    expect(prelude).toMatch(/FROM food_items WHERE id IN \([^)]+\) AND created_by_user_id IS DISTINCT FROM/);
    expect((prelude.match(/RAISE EXCEPTION/g) ?? []).length).toBe(5);
  });

  it('every pet it writes belongs to the fixture user, and it writes only the four pets', () => {
    const petInserts = sql.split('INSERT INTO pets ').slice(1);
    expect(petInserts).toHaveLength(4);
    for (const block of petInserts) expect(block).toContain(`'${PARAMS.userId}'::uuid`);
  });

  it('never writes an AI read, a look, a medication or a photo', () => {
    for (const table of ['event_ai_analysis', 'looks', 'medications', 'medication_administrations', 'event_attachments']) {
      expect(sql).not.toMatch(new RegExp(`INSERT INTO ${table}\\b`));
    }
    expect(sql).not.toMatch(/'check_in'/);
  });

  it('the dry run rolls back and reads the fixture pets back, scoped to the user', () => {
    const dry = emitFixtureSqlForParams(PARAMS, { dryRun: true });
    expect(dry.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    expect(dry).not.toMatch(/\bCOMMIT;/);
    expect(dry).toMatch(/AND p\.user_id = '33333333-3333-4333-8333-333333333333'::uuid/);
  });
});
