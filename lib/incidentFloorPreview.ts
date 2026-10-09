// EN-4's offline preview and the one-arrival rule (Engines v3 PR-28b, CUL-1436;
// docs/nyx-incident-tiers-requirements.md §8.5, §8.7, §6 item 3).
//
// THE PREVIEW. The phone runs the server's own rule (`lib/incidentFloor.ts`, imported, never
// copied) over its own rows the moment a log is written, so a call the record already
// supports is said at once, offline included. It is said on the completion card and the
// record only, with "Worked out on this phone…" (§8.5), and never on History, the month or
// Home's band. The phone NEVER says anything calm about a read it worked out alone: the
// floor is raise-only by construction, and a null tier draws nothing (n=1 never reassures).
//
// THE BOUT (§8.7, GAP-33). A log re-checks every vomit within the server's re-floor window
// of it (24 hours either side for lethargy or a meal, 72 for a vomit), so one log can raise
// several reads. Only one is announced: the most recent read among those raised to the
// loudest tier raised. "Most recent" is the spec's; "among the loudest" is a louder-safe
// refinement, so a bout whose earlier read went to call now and whose latest only to call
// today never announces the quieter of the two. A read is "raised" only ABOVE what it
// already said: the louder of its stored read (the phone's copy) and the tier this phone
// already showed (`lib/incidentTierShown.ts`). So the server landing the tier the preview
// already said announces nothing a second time.
//
// THE CLAIM (§8.5). What the phone showed, its rule version and the row ids it read ride
// the marker as a device claim. The server adopts it only once CUL-1437's shown-tier log
// exists; until then it ignores the field, and its own floor is the stored tier.

import { getDb } from './db';
import { incidentFloor, FLOOR_LETHARGY_HOURS, FLOOR_READ_HOURS, type FloorTier, type FloorVomit } from './incidentFloor';
import { effectiveTierRank, TIER_RANK, type TierRank } from './incidentTier';
import { readCopies } from './readCopy';
import { readShownTiers } from './incidentTierShown';
import { attachDeviceClaim } from './incidentFloorQueue';
import { usePetStore } from '../store/petStore';

/** The server's re-floor reach from a lethargy or meal trigger (`REFLOOR_WINDOW_HOURS`,
 *  `_shared/incident-analysis.ts`). The same value answering the same question, mirrored
 *  and pinned to it by test (C-34). A vomit trigger reaches `FLOOR_READ_HOURS`, the floor's
 *  own constant, as the server's does. */
export const REFLOOR_WINDOW_HOURS = 24;

/** The floor's rule version as the server stamps it (`ruleVersion` in
 *  `analyze-vomit/index.ts`), pinned by test. Rides the device claim. */
export const FLOOR_CLAIM_RULE_VERSION = 'vomit4';

const HOUR = 3_600_000;

export interface BoutRow {
  id: string;
  at: string;
}

export interface BoutVomit extends BoutRow {
  confidence: string | null;
}

export interface BoutInput {
  trigger: { id: string; type: string; at: string };
  /** Live vomits of the pet the caller read, wide enough for every target's floor. */
  vomits: readonly BoutVomit[];
  /** Live lethargy logs of the pet the caller read. */
  lethargy: readonly BoutRow[];
  species: string;
  birthDate: string | null;
}

export interface BoutRead {
  eventId: string;
  at: string;
  tier: FloorTier;
  /** The rows the floor read for this vomit: its vomits and lethargy, by id (§8.5). */
  rowIds: string[];
}

function ms(iso: string): number {
  return Date.parse(iso);
}

/** Every vomit the trigger re-checks, with the call the floor gives it. A vomit the floor
 *  gives no call is absent: the preview has nothing to say about it. Pure. */
export function boutReads(input: BoutInput): BoutRead[] {
  const t = ms(input.trigger.at);
  if (!Number.isFinite(t)) return [];
  const reach = (input.trigger.type === 'vomit' ? FLOOR_READ_HOURS : REFLOOR_WINDOW_HOURS) * HOUR;
  const out: BoutRead[] = [];
  for (const target of input.vomits) {
    const a = ms(target.at);
    if (!Number.isFinite(a) || Math.abs(a - t) > reach) continue;
    const vomits = input.vomits.filter((v) => Number.isFinite(ms(v.at)) && Math.abs(ms(v.at) - a) <= FLOOR_READ_HOURS * HOUR);
    const lethargy = input.lethargy.filter((l) => Number.isFinite(ms(l.at)) && Math.abs(ms(l.at) - a) <= FLOOR_LETHARGY_HOURS * HOUR);
    const anchor: FloorVomit = { at: target.at, confidence: target.confidence };
    const result = incidentFloor({
      anchor,
      vomits: vomits.map((v) => ({ at: v.at, confidence: v.confidence })),
      lethargyAt: lethargy.map((l) => l.at),
      species: input.species,
      birthDate: input.birthDate,
    });
    if (!result.tier) continue;
    out.push({
      eventId: target.id,
      at: target.at,
      tier: result.tier,
      rowIds: [...vomits.map((v) => v.id), ...lethargy.map((l) => l.id)],
    });
  }
  return out;
}

const RANK_OF: Readonly<Record<FloorTier, TierRank>> = {
  call_now: TIER_RANK.call_now,
  call_today: TIER_RANK.call_today,
};

export interface BoutArrival<R extends { eventId: string; at: string; tier: FloorTier }> {
  /** The one read that carries the arrival, or null when nothing was raised. */
  announce: R | null;
  /** Every read raised above what it already said, the announced one included. */
  raised: R[];
}

/** The one-arrival rule (header). `prior` is each read's rank before this run: the louder
 *  of its stored read and what this phone already showed; a read absent from it is quiet.
 *  Pure. */
export function pickBoutArrival<R extends { eventId: string; at: string; tier: FloorTier }>(
  reads: readonly R[],
  prior: ReadonlyMap<string, TierRank>,
): BoutArrival<R> {
  const raised = reads.filter((r) => RANK_OF[r.tier] > (prior.get(r.eventId) ?? TIER_RANK.quiet));
  if (raised.length === 0) return { announce: null, raised: [] };
  const loudest = Math.max(...raised.map((r) => RANK_OF[r.tier]));
  const contenders = raised.filter((r) => RANK_OF[r.tier] === loudest);
  // Latest instant wins, parsed (C-40); an unparseable time loses to any parseable one,
  // and two at one instant fall back to id order so the choice is stable.
  const announce = contenders.reduce((best, r) => {
    const a = ms(r.at);
    const b = ms(best.at);
    const av = Number.isFinite(a) ? a : -Infinity;
    const bv = Number.isFinite(b) ? b : -Infinity;
    if (av !== bv) return av > bv ? r : best;
    return r.eventId > best.eventId ? r : best;
  });
  return { announce, raised };
}

/** Each read's rank before this run: its stored copy and what this phone showed. */
export async function priorRanks(eventIds: readonly string[]): Promise<Map<string, TierRank>> {
  const out = new Map<string, TierRank>();
  const [copies, shown] = await Promise.all([readCopies(eventIds), readShownTiers(eventIds)]);
  for (const id of eventIds) {
    const copy = copies.get(id);
    const stored = copy ? effectiveTierRank(copy) : TIER_RANK.quiet;
    const said = shown.get(id);
    out.set(id, Math.max(stored, said ? RANK_OF[said] : TIER_RANK.quiet) as TierRank);
  }
  return out;
}

export interface FloorAnnouncement {
  /** The read the sentence names. */
  eventId: string;
  vomitAt: string;
  tier: FloorTier;
  /** True when that read is the trigger's own (a vomit raising itself). */
  self: boolean;
  /** Worked out on this phone (the preview), rather than stored by the server. */
  device: boolean;
  petId: string;
  /** Every read this run raised, the named one included. Recorded as shown by the
   *  completion register at the moment a card actually shows the sentence, never before
   *  (the adversarial pass on PR-28b: recorded at preview time, a card that never appeared
   *  silenced every later arrival of the same call). */
  raised: { eventId: string; tier: FloorTier }[];
}

/**
 * The preview, right after a write that owes a re-check (the marker is already written):
 * read the phone's rows around the trigger, floor each vomit it reaches, record what is
 * about to be said, attach the device claim, and return the one sentence to say, or null.
 *
 * Never throws: a failed local read previews nothing, which is the quiet direction only in
 * the sense that the server's own floor still runs on the marker. Nothing calm is said.
 */
export async function previewFloorAfterWrite(triggerId: string): Promise<FloorAnnouncement | null> {
  try {
    const db = getDb();
    const trigger = await db.getFirstAsync<{ event_type: string; pet_id: string; occurred_at: string }>(
      'SELECT event_type, pet_id, occurred_at FROM events WHERE id = ? AND deleted_at IS NULL',
      [triggerId],
    );
    if (!trigger) return null;
    const pet = usePetStore.getState().pets.find((p) => p.id === trigger.pet_id);
    if (!pet) return null;
    const t = ms(trigger.occurred_at);
    if (!Number.isFinite(t)) return null;
    const reach = (trigger.event_type === 'vomit' ? FLOOR_READ_HOURS : REFLOOR_WINDOW_HOURS) * HOUR;
    // Wide enough for every target's own floor, padded a day: the SQL bound compares text,
    // and a hydrated row spells its instant differently (C-40). The exact windows are
    // applied on parsed instants in `boutReads`.
    const pad = 24 * HOUR;
    const lo = new Date(t - reach - FLOOR_READ_HOURS * HOUR - pad).toISOString();
    const hi = new Date(t + reach + FLOOR_READ_HOURS * HOUR + pad).toISOString();
    const rows = await db.getAllAsync<{ id: string; event_type: string; occurred_at: string; occurred_at_confidence: string | null }>(
      `SELECT id, event_type, occurred_at, occurred_at_confidence
         FROM events
        WHERE pet_id = ?
          AND deleted_at IS NULL
          AND event_type IN ('vomit', 'lethargy')
          AND occurred_at >= ?
          AND occurred_at <= ?`,
      [trigger.pet_id, lo, hi],
    );
    const reads = boutReads({
      trigger: { id: triggerId, type: trigger.event_type, at: trigger.occurred_at },
      vomits: rows.filter((r) => r.event_type === 'vomit').map((r) => ({ id: r.id, at: r.occurred_at, confidence: r.occurred_at_confidence })),
      lethargy: rows.filter((r) => r.event_type === 'lethargy').map((r) => ({ id: r.id, at: r.occurred_at })),
      species: pet.species,
      birthDate: pet.date_of_birth,
    });
    if (reads.length === 0) return null;
    const { announce, raised } = pickBoutArrival(reads, await priorRanks(reads.map((r) => r.eventId)));
    if (!announce) return null;
    await attachDeviceClaim(triggerId, {
      rule: FLOOR_CLAIM_RULE_VERSION,
      reads: raised.map((r) => ({ event_id: r.eventId, tier: r.tier, row_ids: r.rowIds })),
    });
    return {
      eventId: announce.eventId,
      vomitAt: announce.at,
      tier: announce.tier,
      self: announce.eventId === triggerId,
      device: true,
      petId: trigger.pet_id,
      raised: raised.map((r) => ({ eventId: r.eventId, tier: r.tier })),
    };
  } catch (e) {
    console.warn('[floor] preview failed:', e);
    return null;
  }
}

/** The record's preview of ONE read: the floor over the phone's rows around it, or null.
 *  The record shows it only where it is louder than the stored read (the caller decides).
 *  Pure over the rows handed in; the same windows as `boutReads`. */
export function previewForRead(input: {
  eventId: string;
  vomits: readonly BoutVomit[];
  lethargy: readonly BoutRow[];
  species: string;
  birthDate: string | null;
}): FloorTier | null {
  const target = input.vomits.find((v) => v.id === input.eventId);
  if (!target) return null;
  const a = ms(target.at);
  if (!Number.isFinite(a)) return null;
  return incidentFloor({
    anchor: { at: target.at, confidence: target.confidence },
    vomits: input.vomits
      .filter((v) => Number.isFinite(ms(v.at)) && Math.abs(ms(v.at) - a) <= FLOOR_READ_HOURS * HOUR)
      .map((v) => ({ at: v.at, confidence: v.confidence })),
    lethargyAt: input.lethargy
      .filter((l) => Number.isFinite(ms(l.at)) && Math.abs(ms(l.at) - a) <= FLOOR_LETHARGY_HOURS * HOUR)
      .map((l) => l.at),
    species: input.species,
    birthDate: input.birthDate,
  }).tier;
}
