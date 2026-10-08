// Supabase Edge Functions shared module — the reads behind "may wait" (Engines v3 PR-27e,
// CUL-1628). The rule is incidentMayWait.ts; this file only fetches the record it reads, and
// re-checks a stored TRUE when the record near it moves.
//
// FAILS CLOSED, NEVER LOUD. Every read is ownership-scoped through the caller's JWT (RLS). A read
// that errors, or anything that throws, returns null, and a null record refuses the wait. It
// never fails the analysis: the read words and the tier still land, with the louder line.
//
// Each window is days, so a pet's rows sit far below PostgREST's max-rows (the floor's reads in
// analyze-vomit make the same call; C-42 names report pulls, which this is not).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  MAY_WAIT_INTAKE_BASELINE_HOURS,
  MAY_WAIT_LETHARGY_HOURS,
  MAY_WAIT_NEIGHBOUR_HOURS,
  mayWaitValue,
  mayWaitVerdict,
  type MayWaitInput,
  type MayWaitNeighbour,
  type MayWaitRecord,
} from './incidentMayWait.ts'

/** The events a neighbour can be: every per-incident read's type. */
export const MAY_WAIT_INCIDENT_TYPES = ['vomit', 'stool_normal', 'diarrhea'] as const

/** The analysis columns a neighbour's check reads (both types' names; the table is one). */
export const MAY_WAIT_ANALYSIS_COLUMNS = [
  'event_id', 'incident_type', 'status', 'error', 'edited_at', 'recommendation', 'tier', 'may_wait',
  'visual_flags', 'contextual_flags', 'ai_raw_payload',
  'blood_present', 'stool_blood_present', 'foreign_material_present', 'colour', 'stool_colour',
] as const

const HOUR = 3_600_000

export interface MayWaitRecordParams {
  petId: string
  /** pets.user_id, for the profile's zone. Null reads no zone, which refuses. */
  ownerId: string | null
  eventId: string
  anchorAt: string
  species: string
  nowMs: number
}

type Result<T> = { data: T | null; error: { message: string } | null }

export async function readMayWaitRecord(client: SupabaseClient, p: MayWaitRecordParams): Promise<MayWaitRecord | null> {
  try {
    const anchorMs = Date.parse(p.anchorAt)
    if (!Number.isFinite(anchorMs)) return null
    const reach = MAY_WAIT_NEIGHBOUR_HOURS * HOUR
    const iso = (ms: number) => new Date(ms).toISOString()
    const lethargyFrom = anchorMs - reach - MAY_WAIT_LETHARGY_HOURS * HOUR
    const lethargyTo = Math.max(anchorMs + reach + MAY_WAIT_LETHARGY_HOURS * HOUR, p.nowMs)
    const mealsFrom = anchorMs - reach - MAY_WAIT_INTAKE_BASELINE_HOURS * HOUR
    const mealsTo = Math.max(anchorMs + reach, p.nowMs)

    const [incidentsRes, lethargyRes, mealsRes, profileRes] = await Promise.all([
      // Twice the reach: the floor re-run on a neighbour reads a window either side of IT.
      client
        .from('events')
        .select('id, event_type, occurred_at, occurred_at_confidence')
        .eq('pet_id', p.petId)
        .in('event_type', [...MAY_WAIT_INCIDENT_TYPES])
        .is('deleted_at', null)
        .gte('occurred_at', iso(anchorMs - 2 * reach))
        .lte('occurred_at', iso(anchorMs + 2 * reach)) as unknown as Promise<Result<{ id: string; event_type: string; occurred_at: string; occurred_at_confidence: string | null }[]>>,
      client
        .from('events')
        .select('occurred_at')
        .eq('pet_id', p.petId)
        .eq('event_type', 'lethargy')
        .is('deleted_at', null)
        .gte('occurred_at', iso(lethargyFrom))
        .lte('occurred_at', iso(lethargyTo)) as unknown as Promise<Result<{ occurred_at: string }[]>>,
      p.species === 'cat'
        ? client
          .from('events')
          .select('occurred_at, meals(intake_rating)')
          .eq('pet_id', p.petId)
          .eq('event_type', 'meal')
          .is('deleted_at', null)
          .gte('occurred_at', iso(mealsFrom))
          .lte('occurred_at', iso(mealsTo)) as unknown as Promise<Result<{ occurred_at: string; meals: unknown }[]>>
        : Promise.resolve({ data: [], error: null } as Result<{ occurred_at: string; meals: unknown }[]>),
      p.ownerId
        ? client.from('user_profiles').select('timezone').eq('id', p.ownerId).maybeSingle() as unknown as Promise<Result<{ timezone: string | null }>>
        : Promise.resolve({ data: null, error: null } as Result<{ timezone: string | null }>),
    ])
    for (const r of [incidentsRes, lethargyRes, mealsRes, profileRes]) {
      if (!r || r.error) return null
    }
    const incidents = incidentsRes.data ?? []

    const near = incidents.filter((e) => e.id !== p.eventId && Math.abs(Date.parse(e.occurred_at) - anchorMs) <= reach)
    const ids = near.map((e) => e.id)
    let photographed = new Set<string>()
    let analyses = new Map<string, Record<string, unknown>>()
    if (ids.length > 0) {
      const [attRes, aiRes] = await Promise.all([
        client.from('event_attachments').select('event_id').in('event_id', ids) as unknown as Promise<Result<{ event_id: string }[]>>,
        client
          .from('event_ai_analysis')
          .select(MAY_WAIT_ANALYSIS_COLUMNS.join(', '))
          .eq('pet_id', p.petId)
          .in('event_id', ids) as unknown as Promise<Result<Record<string, unknown>[]>>,
      ])
      if (!attRes || attRes.error || !aiRes || aiRes.error) return null
      photographed = new Set((attRes.data ?? []).map((a) => a.event_id))
      analyses = new Map((aiRes.data ?? []).map((a) => [a.event_id as string, a]))
    }

    const neighbours: MayWaitNeighbour[] = near.map((e) => ({
      eventId: e.id,
      eventType: e.event_type,
      at: e.occurred_at,
      hasPhoto: photographed.has(e.id),
      analysis: analyses.get(e.id) ?? null,
    }))
    const ratingOf = (m: unknown): string | null => {
      const meal = Array.isArray(m) ? m[0] : m
      const r = (meal as { intake_rating?: unknown } | null)?.intake_rating
      return typeof r === 'string' ? r : null
    }
    return {
      anchorAt: p.anchorAt,
      nowMs: p.nowMs,
      species: p.species,
      timeZone: typeof profileRes.data?.timezone === 'string' ? profileRes.data.timezone : null,
      vomits: incidents
        .filter((e) => e.event_type === 'vomit')
        .map((e) => ({ at: e.occurred_at, confidence: e.occurred_at_confidence })),
      neighbours,
      lethargyAt: (lethargyRes.data ?? []).map((l) => l.occurred_at),
      meals: (mealsRes.data ?? []).map((m) => ({ at: m.occurred_at, rating: ratingOf(m.meals) })),
    }
  } catch (err) {
    console.warn('may_wait: the record could not be read, refusing the wait:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** The model's payload says the photo shows the subject (appears_to_show_vomit / _stool). */
export function payloadShowsSubject(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  return Object.entries(payload as Record<string, unknown>).some(([k, v]) => k.startsWith('appears_to_show_') && v === true)
}

/** The predicate over a row already on file: its words, flags and payload are what the read
 *  wrote; only the record around it may have moved. Used by the floor-only write over a stored
 *  read and by the re-check below. `hasPhoto`: the event has a photo, so a row without a payload
 *  showing the subject is an unread photo. */
export function storedRowInput(params: {
  row: Record<string, unknown>
  incidentType: string
  hasPhoto: boolean
  floorOn: boolean
  record: MayWaitRecord | null
  /** The write's own read fields when it is about to replace the row's (the floor-only write). */
  write?: { tier: string | undefined; contextualFlags: readonly string[]; visualFlags: readonly string[]; status: string }
}): MayWaitInput {
  const r = params.row
  const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    floorOn: params.floorOn,
    write: {
      incidentType: params.incidentType,
      tier: params.write ? params.write.tier : typeof r.tier === 'string' ? r.tier : undefined,
      contextualFlags: params.write?.contextualFlags ?? list(r.contextual_flags),
      visualFlags: params.write?.visualFlags ?? list(r.visual_flags),
      status: params.write?.status ?? (typeof r.status === 'string' ? r.status : ''),
    },
    run: {
      settled: !r.error && (!params.hasPhoto || payloadShowsSubject(r.ai_raw_payload)),
      modelCalled: false,
      columns: null,
    },
    stored: r,
    record: params.record,
  }
}

/** Re-check every stored TRUE within the window of `anchorAt` (the event `excludeEventId`
 *  aside, whose own write decides it), and lower any the record no longer supports. Runs after
 *  a read of a neighbour and after a re-floor, the two moments the server sees the record
 *  move. Lower-only: it writes FALSE or NULL over a TRUE, compare-and-set on the TRUE, and
 *  nothing else. Best-effort: a failure leaves the TRUE, says so, and never fails the caller,
 *  so this is a narrowing of the stale-TRUE window, not a guarantee (the client re-checks the
 *  clock at render, CUL-1629). */
export async function revalidateMayWait(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  p: { petId: string; ownerId: string | null; species: string; anchorAt: string; excludeEventId: string | null; nowMs: number },
): Promise<number> {
  try {
    const anchorMs = Date.parse(p.anchorAt)
    if (!Number.isFinite(anchorMs)) return 0
    const reach = MAY_WAIT_NEIGHBOUR_HOURS * HOUR
    const { data: events, error: evErr } = await (userClient
      .from('events')
      .select('id, event_type, occurred_at')
      .eq('pet_id', p.petId)
      .in('event_type', [...MAY_WAIT_INCIDENT_TYPES])
      .is('deleted_at', null)
      .gte('occurred_at', new Date(anchorMs - reach).toISOString())
      .lte('occurred_at', new Date(anchorMs + reach).toISOString()) as unknown as Promise<Result<{ id: string; event_type: string; occurred_at: string }[]>>)
    if (evErr) throw new Error(evErr.message)
    const candidates = (events ?? []).filter((e) => e.id !== p.excludeEventId)
    if (candidates.length === 0) return 0
    const { data: rows, error: rowErr } = await (userClient
      .from('event_ai_analysis')
      .select(MAY_WAIT_ANALYSIS_COLUMNS.join(', '))
      .eq('pet_id', p.petId)
      .eq('may_wait', true)
      .in('event_id', candidates.map((e) => e.id)) as unknown as Promise<Result<Record<string, unknown>[]>>)
    if (rowErr) throw new Error(rowErr.message)
    // In parallel: each row's re-check is independent, and this runs before the read responds.
    const results = await Promise.all((rows ?? []).map(async (row) => {
      const ev = candidates.find((e) => e.id === row.event_id)
      if (!ev) return 0
      const { data: att, error: attErr } = await (userClient
        .from('event_attachments')
        .select('event_id')
        .eq('event_id', ev.id) as unknown as Promise<Result<{ event_id: string }[]>>)
      // An attachments read that fails reads as "no record" below, which refuses: a transient
      // error lowers a TRUE that may have been right. That is the fail-closed side, on purpose.
      const record = attErr ? null : await readMayWaitRecord(userClient, {
        petId: p.petId, ownerId: p.ownerId, eventId: ev.id, anchorAt: ev.occurred_at, species: p.species, nowMs: p.nowMs,
      })
      const input = storedRowInput({ row, incidentType: ev.event_type, hasPhoto: (att ?? []).length > 0, floorOn: true, record })
      const verdict = mayWaitVerdict(input)
      if (verdict.mayWait) return 0
      const next = mayWaitValue(input.write.tier, verdict, row.may_wait) ?? null
      // Compare-and-set on the TRUE. A zero-row match is silent, unlike updateAnalysisRow (C-39):
      // it means a concurrent write already replaced the TRUE, which is the outcome wanted.
      const { error: upErr } = await adminClient
        .from('event_ai_analysis')
        .update({ may_wait: next })
        .eq('event_id', ev.id)
        .eq('pet_id', p.petId)
        .eq('may_wait', true)
      if (upErr) throw new Error(upErr.message)
      console.info(`may_wait: lowered a stored TRUE on ${ev.id} (${verdict.refusedBy.join(', ')})`)
      return 1
    }))
    const lowered = results.reduce<number>((a, b) => a + b, 0)
    return lowered
  } catch (err) {
    console.warn('may_wait: the re-check of stored TRUEs did not finish:', err instanceof Error ? err.message : String(err))
    return 0
  }
}
