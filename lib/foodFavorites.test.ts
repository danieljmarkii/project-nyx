// The reliable-favorites read (Mixed meals row 4, CUL-2053; spec §5.4): a mixed bowl's
// rating never becomes an acceptance claim about one food. Run on a real engine over the
// app's own schema constants (C-35).

jest.mock('./db', () => ({ getDb: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { FAVORITE_MEALS_SQL, observedFavoriteRows, type FavoriteRow } from './foodFavorites';
import { parseFreeFedIntakeSpans } from './freeFedIntake';
import { selectReliableFavorites } from './food';

const AT = '2026-10-21T08:00:00.000Z';

it('only single-food meals reach the favorites rate: a mix, a raced mix and a count-only meal do not', async () => {
  const db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) db.exec(sql);
  await applyColumnUpgrades(async (sql: string) => db.exec(sql));
  db.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES ('rabbit', 'Acme', 'Rabbit', 'wet', 'meal')`).run();
  const meal = (id: string, food: string | null, count: number | null) => {
    db.prepare(`INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
                VALUES (?, 'p', 'meal', ?, 'manual', 'manual', ?, ?, 1)`).run(id, AT, AT, AT);
    db.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, component_count, intake_rating, created_at, updated_at, synced)
                VALUES (?, ?, 'p', ?, ?, 'all', ?, ?, 1)`).run(`m-${id}`, id, food, count, AT, AT);
  };
  const part = (eventId: string, id: string, deleted: string | null = null) =>
    db.prepare(`INSERT INTO meal_components (id, pet_id, event_id, position, food_item_id, food_label, share, share_source, created_at, updated_at, deleted_at, synced)
                VALUES (?, 'p', ?, 0, 'rabbit', 'Rabbit', 0.5, 'preset', ?, ?, ?, 1)`).run(id, eventId, AT, AT, deleted);
  meal('plain', 'rabbit', null);
  meal('mix', null, 2);
  part('mix', 'c1');
  meal('raced', 'rabbit', null); // an older build put a food back on a meal that is a mix
  part('raced', 'c2');
  meal('count-only', 'rabbit', 2);
  meal('was-mixed', 'rabbit', null); // a food taken out: tombstones only, a plain meal again
  part('was-mixed', 'c3', AT);
  const ids = (db.prepare(FAVORITE_MEALS_SQL.replace('m.intake_rating', 'm.event_id, m.intake_rating')).all('p') as { event_id: string }[])
    .map((r) => r.event_id)
    .sort();
  expect(ids).toEqual(['plain', 'was-mixed']);
  db.close();
});

// CUL-1551: each rating is judged by the bowl down WHEN IT WAS LOGGED (CUL-1086 / CUL-1237's
// spans), never by today's bowls. Driven through the production filter and the real selector.
describe('free-fed ratings are set aside by date, not by food', () => {
  const DAY = 86_400_000;
  const NOW = Date.parse('2026-11-10T12:00:00.000Z');
  const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
  const row = (daysAgo: number, rating: string): FavoriteRow => ({
    food_item_id: 'kibble',
    brand: 'Acme',
    product_name: 'Kibble',
    food_type: 'meal',
    intake_rating: rating,
    occurred_at: at(daysAgo),
  });
  const shelf = (rows: FavoriteRow[], arrangements: Parameters<typeof parseFreeFedIntakeSpans>[0]) =>
    selectReliableFavorites(observedFavoriteRows(rows, parseFreeFedIntakeSpans(arrangements)), {
      freeFedFoodIds: new Set(),
      nowMs: NOW,
    });

  it('a bowl set down AFTER the watched meals leaves those meals counted and drops only the bowl ratings', () => {
    // Five watched meals finished, then the owner leaves the kibble down from 3 days ago; the bowl's
    // "refused" is not a watched refusal, and the old by-food rule hid the five watched meals too.
    const rows = [10, 9, 8, 7, 6].map((d) => row(d, 'all')).concat([row(2, 'refused'), row(1, 'refused')]);
    const bowl = { foodItemId: 'kibble', createdAt: at(3), activeFrom: null, activeUntil: null, endedAt: null };
    const favs = shelf(rows, [bowl]);
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ finishedMeals: 5, ratedMeals: 5 });
  });

  it('an ENDED bowl still sets its own ratings aside, though no bowl is down today', () => {
    // Taken up 5 days ago: its six "ate it all" ratings were never watched. Today's-bowls rule
    // counted them and made a firm favourite out of two watched meals.
    const bowlRows = [12, 11, 10, 9, 8, 7].map((d) => row(d, 'all'));
    const watched = [row(4, 'all'), row(2, 'all')];
    const ended = {
      foodItemId: 'kibble',
      createdAt: at(13),
      activeFrom: null,
      activeUntil: at(5).slice(0, 10),
      endedAt: at(5),
    };
    expect(observedFavoriteRows([...bowlRows, ...watched], parseFreeFedIntakeSpans([ended])).map((r) => r.ms))
      .toEqual(watched.map((r) => Date.parse(r.occurred_at)));
    expect(shelf([...bowlRows, ...watched], [ended])).toEqual([]);
    // The control: the same rows with no bowl on record do make a favourite, so the span is what decides.
    expect(shelf([...bowlRows, ...watched], [])).toHaveLength(1);
  });
});
