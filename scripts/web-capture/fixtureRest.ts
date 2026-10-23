// The capture path's stand-in Supabase (CUL-1895). It renders the device-pass fixture
// story (scripts/fixture/fixtureStory.ts, CUL-1222) as the rows PostgREST would return,
// so the app's own hydrate path (lib/sync.ts) fills its own SQLite exactly as it would
// on a phone signed in to the fixture account. No real account, project or row is ever
// read: the build points the client at a host that cannot resolve, and capture.mjs
// answers every request to it from here.
//
// Rows are materialised against a fixed `nowMs`, the same instant capture.mjs freezes
// the browser's clock at, so a capture is a pure function of the code and the story.
import { buildFixtureStory, type FixtureStory } from '../fixture/fixtureStory.ts';
import { materializeInstantIso, materializeDate } from '../demo/demoStory.ts';

export const FIXTURE_USER_ID = '00000000-0000-4000-8000-00000000c1a5';
export const FIXTURE_EMAIL = 'capture+nyx-fixture@example.invalid';
// A Wednesday afternoon, UTC: every fixture row is materialised against this instant, and
// signals.deno.ts computes the Signal at it, so both read the one default.
export const CAPTURE_DEFAULT_NOW = '2026-10-14T16:00:00Z';

/** `CAPTURE_FLAGS` (a JSON object of app_config keys) as the app_config rows both the app
 *  and the engine read, e.g. '{"history_v2":true}' to capture a build from before a rollout
 *  went GA. Unset, there are none and each reads its own defaults. */
export function captureFlagRows(raw: string | undefined): Row[] {
  return Object.entries(JSON.parse(raw ?? '{}') as Record<string, unknown>).map(([key, value]) => ({ key, value }));
}

type Row = Record<string, unknown>;

export function buildFixtureTables(nowMs: number, timezone = 'UTC'): Record<string, Row[]> {
  const story: FixtureStory = buildFixtureStory({ userId: FIXTURE_USER_ID, timezone });
  const iso = (dayOffset: number, hour = 12, minute = 0) =>
    materializeInstantIso({ dayOffset, hour, minute }, nowMs);
  // Every row "changed" a minute before now, so every watermark pull takes all of it.
  const stamp = new Date(nowMs - 60_000).toISOString();
  const createdAt = iso(-60);

  const tables: Record<string, Row[]> = {
    user_profiles: [
      { id: story.userId, timezone, onboarding_completed_at: createdAt, created_at: createdAt, updated_at: stamp },
    ],
    pets: [],
    food_items: [],
    events: [],
    meals: [],
    weight_checks: [],
    diet_trials: [],
    diet_trial_foods: [],
  };

  story.pets.forEach((pet, i) => {
    tables.pets.push({
      id: pet.id, user_id: story.userId, name: pet.name, species: pet.species, breed: pet.breed,
      weight_kg: pet.weightKg, is_active: true, date_of_birth: null, sex: null, photo_url: null,
      // Ordered by created_at: the first pet is the one Home opens on.
      created_at: iso(-60, 0, i), updated_at: stamp,
    });
    for (const f of pet.foods) {
      tables.food_items.push({
        id: f.id, brand: f.brand, product_name: f.productName, format: f.format, food_type: f.foodType,
        primary_protein: f.primaryProtein, proteins: f.proteins, is_novel_protein: f.isNovelProtein,
        ai_extraction_status: 'manual', source: 'user', created_by_user_id: story.userId,
        archived_at: null, created_at: createdAt, updated_at: stamp,
      });
    }
    const t = pet.trial;
    if (t) {
      tables.diet_trials.push({
        id: t.id, pet_id: pet.id, food_item_id: t.food.id, started_at: materializeDate(t.startedDayOffset, nowMs),
        target_duration_days: t.targetDurationDays, status: 'active', indication: 'gi', phase: 'elimination',
        food_label: t.foodLabel, transition_started_at: materializeDate(t.transitionStartedDayOffset, nowMs),
        target_protein: t.targetProtein, target_protein_set_at: iso(t.startedDayOffset),
        ended_at: null, deleted_at: null, created_at: iso(t.startedDayOffset), updated_at: stamp,
      });
      tables.diet_trial_foods.push({
        id: t.allowedFoodRowId, diet_trial_id: t.id, pet_id: pet.id, food_item_id: t.food.id,
        role: 'primary_diet', food_label: t.food.label, allowed_from: materializeDate(t.startedDayOffset, nowMs),
        deleted_at: null, created_at: iso(t.startedDayOffset), updated_at: stamp,
      });
    }
    for (const e of pet.events) {
      const at = materializeInstantIso(e.time, nowMs);
      tables.events.push({
        id: e.eventId, pet_id: pet.id, event_type: e.type, occurred_at: at, severity: null, notes: null,
        source: 'manual', occurred_at_source: 'manual', occurred_at_confidence: e.confidence,
        occurred_at_earliest: null, occurred_at_latest: null, logged_via: 'app', deleted_at: null,
        created_at: at, updated_at: stamp,
      });
      if (e.meal) {
        const r = e.meal.intakeRating;
        tables.meals.push({
          id: e.meal.mealId, event_id: e.eventId, pet_id: pet.id, food_item_id: e.meal.food.id,
          quantity: 'normal', is_full_portion: r == null ? null : r === 'all', notes: null,
          intake_rating: r, logged_via: 'app', component_count: null, created_at: at, updated_at: stamp,
        });
      }
      if (e.weight) {
        tables.weight_checks.push({
          id: e.weight.weightCheckId, event_id: e.eventId, pet_id: pet.id, weight_kg: e.weight.weightKg,
          deleted_at: null, created_at: at, updated_at: stamp,
        });
      }
    }
  });
  return tables;
}

// ── A small PostgREST: enough of GET's filters for the app's reads ─────────────

function matches(row: Row, column: string, expr: string): boolean {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const v = row[column];
  const asText = v == null ? null : String(v);
  switch (op) {
    case 'eq': return asText === raw || (typeof v === 'boolean' && String(v) === raw);
    case 'neq': return asText !== raw;
    case 'is': return raw === 'null' ? v == null : String(v) === raw;
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      return asText != null && list.includes(asText);
    }
    case 'gte': case 'gt': case 'lte': case 'lt': {
      if (v == null) return false;
      const a = Date.parse(String(v)), b = Date.parse(raw);
      const [x, y] = Number.isNaN(a) || Number.isNaN(b) ? [Number(v), Number(raw)] : [a, b];
      return op === 'gte' ? x >= y : op === 'gt' ? x > y : op === 'lte' ? x <= y : x < y;
    }
    default: return true; // an operator we do not model filters nothing
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

export interface RestAnswer { status: number; body: string; headers?: Record<string, string> }

export function answerRest(
  tables: Record<string, Row[]>,
  method: string,
  url: URL,
  accept: string,
): RestAnswer {
  const table = url.pathname.replace(/^\/rest\/v1\//, '');
  if (method !== 'GET' && method !== 'HEAD') {
    // Writes and RPCs: accepted and dropped. The capture path never needs a write to land.
    return { status: table.startsWith('rpc/') ? 200 : 201, body: table.startsWith('rpc/') ? 'null' : '[]' };
  }
  let rows = tables[table] ?? [];
  for (const [k, v] of url.searchParams) {
    if (RESERVED.has(k) || k === 'or' || k === 'and') continue;
    rows = rows.filter((r) => matches(r, k, v));
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
  const total = rows.length;
  rows = rows.slice(offset, limit === undefined ? undefined : offset + limit);
  if (method === 'HEAD') {
    // `select('*', { count: 'exact', head: true })`: the count rides in Content-Range.
    return { status: 200, body: '', headers: { 'content-range': `*/${total}` } };
  }
  if (accept.includes('vnd.pgrst.object')) {
    if (rows.length === 0) {
      return { status: 406, body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows', hint: null }) };
    }
    return { status: 200, body: JSON.stringify(rows[0]) };
  }
  return { status: 200, body: JSON.stringify(rows), headers: { 'content-range': `${offset}-${offset + Math.max(rows.length - 1, 0)}/${total}` } };
}
