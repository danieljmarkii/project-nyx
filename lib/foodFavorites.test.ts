// The reliable-favorites read (Mixed meals row 4, CUL-2053; spec §5.4): a mixed bowl's
// rating never becomes an acceptance claim about one food. Run on a real engine over the
// app's own schema constants (C-35).

jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { FAVORITE_MEALS_SQL } from './foodFavorites';

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
