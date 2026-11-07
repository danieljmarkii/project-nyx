// The saved copy's flows (Vet report v2 PR-20, CUL-2300). Run with:
//   deno test supabase/functions/generate-report/savedCopy.test.ts
//
// A fake I/O that behaves like migration 113: drafts are writable, a kept row only moves its
// departure, a kept row is never deleted directly, and the short id is unique per pet. What is
// asserted is the ORDER (row before object, object before row on undo), the hash check, and that
// a failed save hands back an unsaved render with no short id.

import { strict as assert } from 'node:assert'
import {
  CROCKFORD,
  DRAFT_TTL_MS,
  KEEP_WINDOW_MS,
  keepCopy,
  newShortId,
  openCopy,
  parseOpenRequest,
  parseKeepRequest,
  reapStaleDrafts,
  saveDraft,
  savedCopyIO,
  savedCopyPath,
  sha256Hex,
  snapshotForCopy,
  type DraftRow,
  type SavedCopyIO,
  type SharedVia,
} from './savedCopy.ts'
import { NEW_PREVIEW_ERROR } from './savedCopy.ts'
import { sha256Hex as textSha } from '../_shared/engineStamps.ts'
import { REPORT_SUMMARY_COPY_VERSION, REPORT_SUMMARY_SCOPE, runKeepGate } from '../_shared/reportSummaryGate.ts'
import { AI_CONSENT_SCOPE } from '../_shared/aiConsent.ts'
import { LEAD_SLOT_MARK, PIN_TEXT_URL_BUDGET, settleLeadForKeep, type KeepLead, type KeepRefusal } from './aiLead/run.ts'
import { h } from './documentV2.ts'

const PET = '11111111-2222-4333-8444-555555555555'
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NOW = Date.parse('2026-11-02T18:00:00Z')

interface Row extends Partial<DraftRow> {
  id: string
  status: 'draft' | 'kept'
  storage_path: string
  content_sha256: string | null
  shared_via: string | null
  shared_at: string | null
  created_at: string
  ai_lead_text?: string | null
  ai_lead_verdict?: unknown
  ai_lead_model?: string | null
}

/** A settle that leaves the lead columns as they are: the fake rows here hold none. */
const NO_LEAD: KeepLead = { set: {}, unchanged: {} }

/** A pinned column as PostgREST reads it: `col` as stored (absent is NULL), `col->>key` the
 *  verdict's field as text (a missing field or a NULL verdict is NULL). */
function pinnedValue(r: Record<string, unknown>, key: string): unknown {
  const [col, field] = key.split('->>')
  const v = r[col] ?? null
  if (field === undefined) return v
  if (v === null || typeof v !== 'object') return null
  const f = (v as Record<string, unknown>)[field]
  return f === undefined || f === null ? null : String(f)
}

function fakeIO(opts: { failInsert?: boolean; failUpload?: boolean; failStamp?: boolean; takenShortIds?: string[] } = {}) {
  const rows = new Map<string, Row>()
  const objects = new Map<string, Uint8Array>()
  const log: string[] = []
  const taken = new Set(opts.takenShortIds ?? [])
  const io: SavedCopyIO = {
    insertDraft: async (r) => {
      log.push(`insert ${r.id}`)
      if (opts.failInsert) return 'failed'
      if (taken.has(r.short_id)) return 'short_id_taken'
      taken.add(r.short_id)
      rows.set(r.id, { ...r, status: 'draft', content_sha256: null, shared_via: null, shared_at: null, created_at: new Date(NOW).toISOString() })
      return 'ok'
    },
    upload: async (path, bytes) => {
      log.push(`upload ${path}`)
      if (opts.failUpload) return false
      if (objects.has(path)) return false // upsert: false
      objects.set(path, bytes)
      return true
    },
    stampHash: async (id, sha) => {
      log.push(`stamp ${id}`)
      const r = rows.get(id)
      if (opts.failStamp || !r || r.status !== 'draft') return false
      r.content_sha256 = sha
      return true
    },
    deleteDraft: async (id) => {
      log.push(`delete-row ${id}`)
      const r = rows.get(id)
      if (r && r.status === 'kept') return false
      rows.delete(id)
      return true
    },
    removeObjects: async (paths) => {
      log.push(`remove ${paths.join(',')}`)
      for (const p of paths) objects.delete(p)
      return true
    },
    listStaleDrafts: async (before, limit) =>
      [...rows.values()].filter((r) => r.status === 'draft' && r.created_at < before).slice(0, limit).map((r) => ({ id: r.id, storage_path: r.storage_path })),
    deleteDrafts: async (ids) => {
      log.push(`delete-rows ${ids.join(',')}`)
      for (const id of ids) if (rows.get(id)?.status === 'draft') rows.delete(id)
      return true
    },
    readRow: async (id) => {
      const r = rows.get(id)
      return r ? { status: r.status, storage_path: r.storage_path, content_sha256: r.content_sha256, created_at: r.created_at, shared_at: r.shared_at } : null
    },
    download: async (path) => objects.get(path) ?? null,
    markKept: async (id, via, at, sha, lead) => {
      // One statement, as savedCopyIO's: the WHERE (draft, hash, every pinned lead column), then
      // the lead's settled columns and the keep together.
      const r = rows.get(id) as (Row & Record<string, unknown>) | undefined
      if (!r || r.status !== 'draft' || r.content_sha256 !== sha) return false
      if (Object.entries(lead.unchanged).some(([k, v]) => pinnedValue(r, k) !== v)) return false
      Object.assign(r, lead.set, { status: 'kept', shared_via: via, shared_at: at })
      return true
    },
    restamp: async (id, via, at) => {
      const r = rows.get(id)
      if (!r || r.status !== 'kept') return false
      Object.assign(r, { shared_via: via, shared_at: at })
      return true
    },
    now: () => NOW,
  }
  return { io, rows, objects, log }
}

const input = {
  petId: PET,
  startDate: '2026-10-01',
  endDate: '2026-11-02',
  scopeBasis: 'since_visit',
  params: { requested_window: null },
  snapshot: { scope: { startDate: '2026-10-01' }, incidentPhotos: [{ id: 'x', dataUri: 'data:image/jpeg;base64,AAAA' }] },
  photosLeftOut: 0,
}
const render = (shortId: string | null) => ({ doc: { shortId }, html: `<html>report ${shortId ?? 'unsaved'}</html>` })

// ── Pure pieces ──────────────────────────────────────────────────────────────

Deno.test('the path is the row key 113 accepts: {pet}/{id}.html, lower-case', () => {
  assert.equal(savedCopyPath(PET.toUpperCase(), ID.toUpperCase()), `${PET}/${ID}.html`)
  assert.throws(() => savedCopyPath(`${PET}/..`, ID))
  assert.throws(() => savedCopyPath(PET, '../x'))
})

Deno.test('short ids are 4 Crockford characters and every byte maps without bias', () => {
  assert.equal(CROCKFORD.length, 32)
  assert.ok(!/[ILOU]/.test(CROCKFORD))
  for (let i = 0; i < 50; i++) assert.match(newShortId(), /^[0-9A-HJKMNP-TV-Z]{4}$/)
  assert.equal(newShortId(() => new Uint8Array([0, 31, 32, 255])), '0Z0Z')
})

Deno.test('sha256Hex is lower-case hex of the bytes', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

Deno.test('the stored snapshot drops photo bytes and keeps everything else', () => {
  const out = snapshotForCopy(input.snapshot) as { incidentPhotos: Array<{ id: string; dataUri: unknown }>; scope: unknown }
  assert.equal(out.incidentPhotos[0].dataUri, null)
  assert.equal(out.incidentPhotos[0].id, 'x')
  assert.deepEqual(out.scope, { startDate: '2026-10-01' })
})

Deno.test('a keep request names a well-formed id and a known route, or is refused', () => {
  assert.equal(parseKeepRequest({ mode: 'ai_lead' }), null)
  assert.deepEqual(parseKeepRequest({ mode: 'keep', reportId: ID.toUpperCase(), sharedVia: 'email' }), { reportId: ID, sharedVia: 'email', sharedAt: null })
  assert.deepEqual(parseKeepRequest({ mode: 'keep', report_id: 'nope', shared_via: 'fax' }), { reportId: null, sharedVia: null, sharedAt: null })
  // Exam-room mode is a departure (CUL-2434, PM go (a) 2026-11-04).
  assert.deepEqual(parseKeepRequest({ mode: 'keep', reportId: ID, sharedVia: 'shown' }), { reportId: ID, sharedVia: 'shown', sharedAt: null })
  // The phone's retry names its send time (CUL-2522); a malformed one reads as none.
  assert.equal(parseKeepRequest({ mode: 'keep', reportId: ID, sharedVia: 'email', sharedAt: '2026-11-05T12:00:00.000Z' })?.sharedAt, '2026-11-05T12:00:00.000Z')
  assert.equal(parseKeepRequest({ mode: 'keep', reportId: ID, sharedVia: 'email', sharedAt: 'soon' })?.sharedAt, null)
})

// ── Saving at Preview ────────────────────────────────────────────────────────

Deno.test('a save writes the row, then the object, then the hash, and prints the short id', async () => {
  const f = fakeIO()
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, true)
  if (!out.saved) return
  assert.equal(out.reportId, ID)
  assert.match(out.rendered.html, new RegExp(`report ${out.shortId}`))
  assert.deepEqual(f.log, [`insert ${ID}`, `upload ${PET}/${ID}.html`, `stamp ${ID}`])
  const row = f.rows.get(ID)!
  assert.equal(row.short_id, out.shortId)
  assert.equal(row.report_version, 'v2')
  // The stored bytes are the returned html, and the stamped hash is theirs.
  const stored = f.objects.get(`${PET}/${ID}.html`)!
  assert.equal(new TextDecoder().decode(stored), out.rendered.html)
  assert.equal(row.content_sha256, await sha256Hex(stored))
})

Deno.test('a short-id clash draws again; a run of clashes saves nothing', async () => {
  const seq = (...xs: string[]) => () => xs.shift() ?? xs[xs.length - 1] ?? 'ZZZZ'
  const f = fakeIO({ takenShortIds: ['0000'] })
  const out = await saveDraft(f.io, input, render, () => ID, seq('0000', '0001'))
  assert.equal(out.saved && out.shortId, '0001')
  const all = fakeIO({ takenShortIds: ['0001'] })
  const none = await saveDraft(all.io, input, render, () => ID, () => '0001')
  assert.equal(none.saved, false)
  assert.match(none.rendered.html, /unsaved/)
  assert.equal(all.rows.size, 0)
})

Deno.test('a failed insert saves nothing and renders with no short id', async () => {
  const f = fakeIO({ failInsert: true })
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, false)
  assert.equal((out.rendered.doc as { shortId: string | null }).shortId, null)
  assert.equal(f.rows.size, 0)
  assert.equal(f.objects.size, 0)
})

Deno.test('a failed upload removes the key, then the row: nothing is left that nothing names', async () => {
  const f = fakeIO({ failUpload: true })
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, false)
  assert.deepEqual(f.log.slice(-2), [`remove ${PET}/${ID}.html`, `delete-row ${ID}`])
  assert.equal(f.rows.size, 0)
  assert.equal(f.objects.size, 0)
})

Deno.test('a failed hash stamp removes the object before the row', async () => {
  const f = fakeIO({ failStamp: true })
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, false)
  assert.deepEqual(f.log.slice(-2), [`remove ${PET}/${ID}.html`, `delete-row ${ID}`])
  assert.equal(f.objects.size, 0)
  assert.equal(f.rows.size, 0)
})

// ── The reaper ───────────────────────────────────────────────────────────────

Deno.test('the reaper removes stale drafts objects-first and never touches a kept copy or a fresh draft', async () => {
  const f = fakeIO()
  const old = new Date(NOW - DRAFT_TTL_MS - 1).toISOString()
  const fresh = new Date(NOW - DRAFT_TTL_MS + 60_000).toISOString()
  const mk = (id: string, status: 'draft' | 'kept', created_at: string) => {
    f.rows.set(id, { id, status, storage_path: `${PET}/${id}.html`, content_sha256: 'x', shared_via: null, shared_at: null, created_at })
    f.objects.set(`${PET}/${id}.html`, new Uint8Array([1]))
  }
  mk('d-old', 'draft', old)
  mk('d-new', 'draft', fresh)
  mk('k-old', 'kept', old)
  assert.equal(await reapStaleDrafts(f.io), 1)
  assert.deepEqual([...f.rows.keys()].sort(), ['d-new', 'k-old'])
  assert.deepEqual([...f.objects.keys()].sort(), [`${PET}/d-new.html`, `${PET}/k-old.html`])
  assert.ok(f.log.indexOf(`remove ${PET}/d-old.html`) < f.log.indexOf('delete-rows d-old'))
})

Deno.test('a reaper whose object remove fails deletes no row', async () => {
  const f = fakeIO()
  f.rows.set('d', { id: 'd', status: 'draft', storage_path: `${PET}/d.html`, content_sha256: null, shared_via: null, shared_at: null, created_at: '2000-01-01T00:00:00Z' })
  f.io.removeObjects = async () => false
  assert.equal(await reapStaleDrafts(f.io), 0)
  assert.ok(f.rows.has('d'))
})

// ── Keeping at send ──────────────────────────────────────────────────────────

async function savedOne() {
  const f = fakeIO()
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, true)
  return f
}

Deno.test('keep turns the draft kept, with its route and the server time, after settling the lead', async () => {
  const f = await savedOne()
  const order: string[] = []
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async (html) => {
    order.push(`settle ${f.rows.get(ID)!.status}`)
    assert.match(html, /report /)
    return NO_LEAD
  })
  assert.deepEqual(out, { status: 200, body: { kept: true, first: true } })
  assert.deepEqual(order, ['settle draft'])
  const row = f.rows.get(ID)!
  assert.equal(row.status, 'kept')
  assert.equal(row.shared_via, 'email')
  assert.equal(row.shared_at, new Date(NOW).toISOString())
})

Deno.test('a second departure moves only the stamp', async () => {
  const f = await savedOne()
  await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)
  let settled = false
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' as SharedVia }, async () => ((settled = true), NO_LEAD))
  assert.deepEqual(out, { status: 200, body: { kept: true, first: false } })
  assert.equal(settled, false, 'a kept copy is frozen; its lead is never re-settled')
  assert.equal(f.rows.get(ID)!.shared_via, 'print')
})

Deno.test('a stored file that no longer matches its hash is never kept', async () => {
  const f = await savedOne()
  f.objects.set(`${PET}/${ID}.html`, new TextEncoder().encode('<html>overwritten</html>'))
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'share' }, async () => NO_LEAD)
  assert.equal(out.status, 409)
  assert.equal(f.rows.get(ID)!.status, 'draft')
})

Deno.test('a missing file, an unknown id, a failed lead settle or a bad request is never kept', async () => {
  const f = await savedOne()
  assert.equal((await keepCopy(f.io, { reportId: null, sharedVia: 'email' }, async () => NO_LEAD)).status, 400)
  assert.equal((await keepCopy(f.io, { reportId: ID, sharedVia: null }, async () => NO_LEAD)).status, 400)
  assert.equal((await keepCopy(f.io, { reportId: 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee', sharedVia: 'email' }, async () => NO_LEAD)).status, 404)
  assert.equal((await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => null)).status, 500)
  assert.equal(f.rows.get(ID)!.status, 'draft')
  f.objects.clear()
  assert.equal((await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)).status, 409)
  f.io.readRow = async () => 'error'
  assert.equal((await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)).status, 500)
})

// ── The lead on a kept copy (aiLead/run.ts) ──────────────────────────────────

type SettleIO = Parameters<typeof settleLeadForKeep>[0]
const ALLOW = { allow: true } as unknown as Awaited<ReturnType<SettleIO['keepGate']>>
const DENY = { allow: false, reason: 'consent_declined', scope: 'report_summary' } as unknown as Awaited<ReturnType<SettleIO['keepGate']>>
const AT = '2026-11-05T12:00:00.000Z'

function leadIO(text: string | null, verdict: unknown, model: string | null = null, gate = ALLOW) {
  const io = { readDraft: async () => ({ found: true, text, verdict, model }), keepGate: async () => {
    io.gateCalls++
    return gate
  }, runGate: () => {
    throw new Error('the keep never asks the generation gate (CUL-2575)')
  }, gateCalls: 0 }
  return io as SettleIO & { gateCalls: number }
}

/** The copy as renderPrintV2 stores it when it prints the lead (aiLeadSlot's shape). */
function slotHtml(sentences: string[]): string {
  const body = sentences.map((t) => `<span class="ais">${h(t)}</span><sup class="cite"> Line 1</sup>`).join(' ')
  return `<html><section class="ailead" ${LEAD_SLOT_MARK}><p class="ailabel">AI summary <span class="beta">beta</span></p><p class="lede serif">${body}</p></section></html>`
}

function isLead(x: KeepLead | KeepRefusal | null): KeepLead {
  assert.ok(x !== null && !('refused' in x), `a lead, not ${JSON.stringify(x)}`)
  return x as KeepLead
}

Deno.test('a lead the sent copy does not print is cleared, the verdict says why, and every column read is pinned', async () => {
  const lead = await settleLeadForKeep(leadIO('Cooper vomited on 3 days.', { outcome: 'printed', fact_hash: 'h', at: AT }, 'm'), '<html>no lead</html>')
  assert.deepEqual(lead, {
    set: { ai_lead_text: null, ai_lead_verdict: { outcome: 'printed', fact_hash: 'h', at: AT, at_send: { printed: false, reason: 'not_on_sent_copy' } }, ai_lead_model: null },
    unchanged: {
      ai_lead_model: 'm',
      'ai_lead_verdict->>at': AT,
      'ai_lead_verdict->>outcome': 'printed',
      'ai_lead_verdict->>fact_hash': 'h',
      'ai_lead_verdict->>text_sha': null,
      ai_lead_text: 'Cooper vomited on 3 days.',
    },
  })
})

Deno.test('a cleared lead leaves no model output in the verdict it freezes (CUL-2377, pass 2)', async () => {
  // A verdict whose sentences and checker quotes are model text: none of it may ride into the
  // kept row, and migration 118 refuses a draft write that still carries it after a "no".
  const lead = isLead(await settleLeadForKeep(leadIO('Cooper vomited on 3 days.', {
    outcome: 'printed', fact_hash: 'h', sentences: [{ text: 'Cooper vomited on 3 days.' }],
    checker: { takeaway: 'x', quotes: { H1: 'Cooper vomited' } }, verifier_errors: [],
  }), '<html>no lead</html>'))
  assert.deepEqual(lead.set, {
    ai_lead_text: null,
    ai_lead_verdict: { outcome: 'printed', fact_hash: 'h', verifier_errors: [], at_send: { printed: false, reason: 'not_on_sent_copy' } },
    ai_lead_model: null,
  })
  const rejected = isLead(await settleLeadForKeep(leadIO(null, { outcome: 'rejected', sentences: [{ text: 'x' }], checker: { quotes: {} } }), '<html></html>'))
  assert.deepEqual(rejected.set.ai_lead_verdict, { outcome: 'rejected', at_send: { printed: false, reason: 'not_printed' } })
})

Deno.test('no lead yet is recorded as not ready and pinned as all-null; a declined one keeps its verdict', async () => {
  const none = isLead(await settleLeadForKeep(leadIO(null, null), '<html></html>'))
  assert.deepEqual(none.set.ai_lead_verdict, { at_send: { printed: false, reason: 'not_ready' } })
  assert.deepEqual(none.unchanged, { ai_lead_model: null, ai_lead_verdict: null, ai_lead_text: null })
  const declined = isLead(await settleLeadForKeep(leadIO(null, { outcome: 'declined' }), '<html></html>'))
  assert.deepEqual(declined.set.ai_lead_verdict, { outcome: 'declined', at_send: { printed: false, reason: 'not_printed' } })
})

Deno.test('a lead the stored copy prints is pinned on text, verdict and model, never rewritten', async () => {
  const text = 'Cooper vomited on 3 days. He ate <less> & slept.'
  const io = leadIO(text, { outcome: 'printed', at: AT, fact_hash: 'h' }, 'writer-1')
  const lead = await settleLeadForKeep(io, slotHtml(['Cooper vomited on 3 days.', 'He ate <less> & slept.']))
  assert.deepEqual(lead, {
    set: {},
    unchanged: { ai_lead_model: 'writer-1', 'ai_lead_verdict->>at': AT, 'ai_lead_verdict->>outcome': 'printed', 'ai_lead_verdict->>fact_hash': 'h', 'ai_lead_verdict->>text_sha': null, ai_lead_text: text },
  })
  assert.equal(io.gateCalls, 1, 'consent is re-checked before a pinned keep')
})

Deno.test('a slot that does not hold the draft text refuses the keep for good (CUL-2523)', async () => {
  const io = leadIO('Cooper vomited on 3 days.', { outcome: 'printed', at: AT })
  assert.deepEqual(await settleLeadForKeep(io, slotHtml(['Cooper vomited on 4 days.'])), { refused: 'mismatch' })
  // The mark with no sentence spans, two slots, or a draft whose text was cleared after the render.
  assert.deepEqual(await settleLeadForKeep(io, `<section ${LEAD_SLOT_MARK}>`), { refused: 'mismatch' })
  assert.deepEqual(await settleLeadForKeep(io, slotHtml(['Cooper vomited on 3 days.']) + slotHtml(['Cooper vomited on 3 days.'])), { refused: 'mismatch' })
  assert.deepEqual(await settleLeadForKeep(leadIO(null, null), slotHtml(['Cooper vomited on 3 days.'])), { refused: 'mismatch' })
  assert.equal(io.gateCalls, 0)
})

Deno.test('a pinned keep after a withdrawal is refused, never frozen with the summary (PM ruling (a))', async () => {
  const io = leadIO('Cooper vomited on 3 days.', { outcome: 'printed', at: AT }, 'm', DENY)
  assert.deepEqual(await settleLeadForKeep(io, slotHtml(['Cooper vomited on 3 days.'])), { refused: 'withdrawn' })
})

Deno.test('a pinned keep whose consent, config or pet read failed is retried (500), never refused for good (CUL-2575)', async () => {
  for (const reason of ['consent_declined', 'flag_off', 'pet_not_owned']) {
    const unread = { allow: false, reason, scope: 'ai_boundary', flag: 'report_ai_lead', unread: true } as unknown as Awaited<ReturnType<SettleIO['keepGate']>>
    const io = leadIO('Cooper vomited on 3 days.', { outcome: 'printed', at: AT }, 'm', unread)
    assert.equal(await settleLeadForKeep(io, slotHtml(['Cooper vomited on 3 days.'])), null, reason)
  }
  // End to end: the keep answers 500, which the phone retries, and the draft stays a draft.
  const f = await savedOne()
  await printingCopy(f, 'Cooper ate well.', { outcome: 'printed', at: AT }, 'm')
  const gate = { allow: false, reason: 'consent_declined', scope: 'ai_boundary', unread: true } as unknown as Awaited<ReturnType<SettleIO['keepGate']>>
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, (html) => settleLeadForKeep({ ...plainSettleIO(f), keepGate: async () => gate }, html))
  assert.equal(out.status, 500)
  assert.equal(f.rows.get(ID)!.status, 'draft')
})

Deno.test('a flag switched off or an older summary wording keeps the printed copy as sent (CUL-2575, ruling (b))', async () => {
  // The real keep gate over its reads. The config read throws: a keep that consulted the flags
  // would refuse, so this proves it never does.
  const gateIO = (summaryCopy: string, owned = true) => ({
    readConsent: async () => ({ data: [{ scope: AI_CONSENT_SCOPE, granted: true, copy_version: 'x' }, { scope: REPORT_SUMMARY_SCOPE, granted: true, copy_version: summaryCopy }], error: null }),
    readConfig: async () => { throw new Error('the keep never reads the flags') },
    petOwned: async () => owned,
    recordUsage: async () => { throw new Error('the keep never spends a count') },
  })
  const text = 'Cooper ate well.'
  for (const summaryCopy of [REPORT_SUMMARY_COPY_VERSION, '2026-01-01']) {
    const f = await savedOne()
    await printingCopy(f, text, { outcome: 'printed', at: AT }, 'm')
    const io = { ...plainSettleIO(f), keepGate: () => runKeepGate(gateIO(summaryCopy), 'u') }
    const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, (html) => settleLeadForKeep(io, html))
    assert.deepEqual(out, { status: 200, body: { kept: true, first: true } }, summaryCopy)
    assert.equal(f.rows.get(ID)!.status, 'kept')
    assert.equal(f.rows.get(ID)!.ai_lead_text, text, 'the kept row records the summary the vet received')
  }
  // Another owner's pet still refuses for good.
  const g = await savedOne()
  await printingCopy(g, text, { outcome: 'printed', at: AT }, 'm')
  const out = await keepCopy(g.io, { reportId: ID, sharedVia: 'print' }, (html) => settleLeadForKeep({ ...plainSettleIO(g), keepGate: () => runKeepGate(gateIO(REPORT_SUMMARY_COPY_VERSION, false), 'u') }, html))
  assert.equal(out.status, 409)
  assert.equal(g.rows.get(ID)!.status, 'draft')
})

Deno.test('a refused settle answers 409 and leaves the draft a draft', async () => {
  const f = await savedOne()
  for (const refused of ['withdrawn', 'mismatch'] as const) {
    const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => ({ refused }))
    assert.deepEqual(out, { status: 409, body: { error: NEW_PREVIEW_ERROR } }, 'the phone says "Preview the report again"')
    assert.equal(f.rows.get(ID)!.status, 'draft')
  }
})

Deno.test('a replayed keep stamps the phone send time, bounded by the Preview and now (rls F3, CUL-2522)', async () => {
  const f = await savedOne()
  f.rows.get(ID)!.created_at = new Date(NOW - 60_000).toISOString()
  const created = Date.parse(f.rows.get(ID)!.created_at)
  const sent = new Date(created + 5_000).toISOString()
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email', sharedAt: sent }, async () => NO_LEAD)
  assert.deepEqual(out, { status: 200, body: { kept: true, first: true } })
  assert.equal(f.rows.get(ID)!.shared_at, sent, 'the departure is the send, not the next open')
  // A claimed time before the Preview, or in the future, is clamped into the window.
  const g = await savedOne()
  g.rows.get(ID)!.created_at = new Date(NOW - 60_000).toISOString()
  await keepCopy(g.io, { reportId: ID, sharedVia: 'email', sharedAt: '2000-01-01T00:00:00.000Z' }, async () => NO_LEAD)
  assert.equal(Date.parse(g.rows.get(ID)!.shared_at as string), Date.parse(g.rows.get(ID)!.created_at))
  const k = await savedOne()
  await keepCopy(k.io, { reportId: ID, sharedVia: 'email', sharedAt: '2099-01-01T00:00:00.000Z' }, async () => NO_LEAD)
  assert.equal(Date.parse(k.rows.get(ID)!.shared_at as string), NOW)
})

Deno.test('a replay of a LATER send the app died on still stamps that departure (rls R1)', async () => {
  const f = await savedOne()
  f.rows.get(ID)!.created_at = new Date(NOW - 600_000).toISOString()
  // Email kept a while ago, then a share whose keep the app died on.
  await keepCopy(f.io, { reportId: ID, sharedVia: 'email', sharedAt: new Date(NOW - 300_000).toISOString() }, async () => NO_LEAD)
  const later = new Date(NOW - 60_000).toISOString()
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'share', sharedAt: later }, async () => NO_LEAD)
  assert.deepEqual(out, { status: 200, body: { kept: true, first: false } })
  assert.equal(f.rows.get(ID)!.shared_at, later)
  assert.equal(f.rows.get(ID)!.shared_via, 'share')
})

Deno.test('a replay of a keep that already landed changes nothing on the kept copy (rls F3)', async () => {
  const f = await savedOne()
  await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, async () => NO_LEAD)
  const before = { ...f.rows.get(ID)! }
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email', sharedAt: new Date(NOW - 60_000).toISOString() }, async () => NO_LEAD)
  assert.deepEqual(out, { status: 200, body: { kept: true, first: false } })
  assert.equal(f.rows.get(ID)!.shared_at, before.shared_at)
  assert.equal(f.rows.get(ID)!.shared_via, 'print')
})

Deno.test('an unreadable verdict is no pin: the keep is refused rather than guessed', async () => {
  assert.equal(await settleLeadForKeep(leadIO(null, ['not', 'an', 'object']), '<html></html>'), null)
  assert.equal(await settleLeadForKeep(leadIO(null, { at: 12 }), '<html></html>'), null)
})

Deno.test('a long lead is pinned by its stored text_sha, and the longest pin URL stays short (CUL-2574)', async () => {
  // aiLead caps a lead at 2000 characters; three-byte characters percent-encode to nine bytes each,
  // ~18 KB of text. With text_sha the text never rides in the URL, at any length.
  const text = '猫'.repeat(2000)
  const sha = await textSha(text)
  const lead = isLead(await settleLeadForKeep(leadIO(text, { outcome: 'printed', at: AT, fact_hash: 'a'.repeat(64), text_sha: sha }, 'claude-model-id'), '<html></html>'))
  assert.ok(!('ai_lead_text' in lead.unchanged), 'the text is not in the filter')
  assert.equal(lead.unchanged['ai_lead_verdict->>text_sha'], sha)
  // The longest pin set the keep can send: every verdict pin at its longest, plus the model and
  // the keep's own filters. The gateway's limit is not reached from here (no production call);
  // 2 KB is well under any common proxy's request-line limit (8 KB).
  const url = new URL('https://x.supabase.co/rest/v1/vet_reports')
  for (const k of ['id', 'pet_id', 'generated_by', 'status', 'content_sha256']) url.searchParams.append(k, `eq.${'f'.repeat(64)}`)
  for (const [k, v] of Object.entries(lead.unchanged)) url.searchParams.append(k, v === null ? 'is.null' : `eq.${v}`)
  assert.ok(url.href.length < 2048, `${url.href.length} bytes`)
})

Deno.test('a verdict from before text_sha pins a short text by value, and a long one is no pin (CUL-2574)', async () => {
  const short = 'a'.repeat(PIN_TEXT_URL_BUDGET)
  const pinned = isLead(await settleLeadForKeep(leadIO(short, { outcome: 'printed', at: AT }), '<html></html>'))
  assert.equal(pinned.unchanged.ai_lead_text, short)
  // Past the budget the old code pinned the timing alone; now the keep is refused (500, retried).
  assert.equal(await settleLeadForKeep(leadIO(short + 'a', { outcome: 'printed', at: AT }), '<html></html>'), null)
})

Deno.test('a text_sha that does not match the text, or one with no text, is no pin (CUL-2574)', async () => {
  const text = 'Cooper vomited on 3 days.'
  assert.equal(await settleLeadForKeep(leadIO(text, { outcome: 'printed', at: AT, text_sha: await textSha('other') }), '<html></html>'), null)
  assert.equal(await settleLeadForKeep(leadIO(null, { outcome: 'failed', at: AT, text_sha: await textSha(text) }), '<html></html>'), null)
  assert.equal(await settleLeadForKeep(leadIO(text, { outcome: 'printed', at: AT, text_sha: 7 }), '<html></html>'), null)
})

Deno.test('a cleared lead takes its text_sha with it: the kept verdict fingerprints no text (CUL-2574)', async () => {
  const text = 'Cooper vomited on 3 days.'
  const lead = isLead(await settleLeadForKeep(leadIO(text, { outcome: 'printed', at: AT, text_sha: await textSha(text) }), '<html>no lead</html>'))
  assert.deepEqual(lead.set.ai_lead_verdict, { outcome: 'printed', at: AT, at_send: { printed: false, reason: 'not_on_sent_copy' } })
})

Deno.test('an unreadable draft fails the settle, so the keep is refused', async () => {
  const io = { readDraft: async () => ({ found: false, text: null, verdict: null }), keepGate: async () => ALLOW } as unknown as SettleIO
  assert.equal(await settleLeadForKeep(io, '<html></html>'), null)
})

// ── The keep is one write (CUL-2436, rls-privacy-reviewer F3 on PR-20) ────────
//
// An `ai_lead` request's writeDraft lands AFTER the settle has read the draft and BEFORE the keep
// writes. The settle reads through the fake row, as draftLeadIO's readDraft does; the race is
// injected exactly in that gap, as the real lead's update (draft only) would land.

const RACED = { text: 'Cooper vomited on 3 days.', verdict: { outcome: 'printed', fact_hash: 'h', at: '2026-11-05T12:00:01.000Z', sentences: [{ text: 'Cooper vomited on 3 days.' }] }, model: 'm' }

function plainSettleIO(f: ReturnType<typeof fakeIO>) {
  return {
    readDraft: async () => {
      const r = f.rows.get(ID)!
      return { found: true, text: r.ai_lead_text ?? null, verdict: r.ai_lead_verdict ?? null, model: r.ai_lead_model ?? null }
    },
    keepGate: async () => ALLOW,
  } as unknown as Parameters<typeof settleLeadForKeep>[0]
}

function racedSettle(f: ReturnType<typeof fakeIO>) {
  const io = {
    readDraft: async () => {
      const r = f.rows.get(ID)!
      return { found: true, text: r.ai_lead_text ?? null, verdict: r.ai_lead_verdict ?? null, model: r.ai_lead_model ?? null }
    },
    keepGate: async () => ALLOW,
  } as unknown as Parameters<typeof settleLeadForKeep>[0]
  const writeDraft = () => {
    const r = f.rows.get(ID)!
    if (r.status !== 'draft') return false
    Object.assign(r, { ai_lead_text: RACED.text, ai_lead_verdict: RACED.verdict, ai_lead_model: RACED.model })
    return true
  }
  return async (html: string) => {
    const lead = await settleLeadForKeep(io, html)
    assert.equal(writeDraft(), true, 'the lead lands in the gap, on a draft')
    return lead
  }
}

Deno.test('a summary written between the settle and the keep never freezes: the keep is refused, and the retry settles fresh', async () => {
  const f = await savedOne()
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, racedSettle(f))
  assert.equal(out.status, 500, 'the cleared branch pinned the NULL it read; the race moved it (CUL-2523)')
  assert.equal(f.rows.get(ID)!.status, 'draft')
  // The client's retry: the settle reads the raced lead, the copy does not print it, so it clears.
  const retry = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, (html) => settleLeadForKeep(plainSettleIO(f), html))
  assert.deepEqual(retry, { status: 200, body: { kept: true, first: true } })
  const row = f.rows.get(ID)!
  assert.equal(row.status, 'kept')
  assert.equal(row.ai_lead_text, null, 'the stored copy prints no lead, so the kept row claims none')
  assert.equal(row.ai_lead_model, null)
  assert.deepEqual(row.ai_lead_verdict, { outcome: 'printed', fact_hash: 'h', at: RACED.verdict.at, at_send: { printed: false, reason: 'not_on_sent_copy' } })
})

Deno.test('the old two writes, replayed against the same race, froze the summary (the test can fail)', async () => {
  // The pre-CUL-2436 shape: the settle is its own write, then a keep that carries no lead. The
  // same injected race now leaves the raced summary on a kept copy whose HTML never printed it.
  const f = await savedOne()
  const settle = racedSettle(f)
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async (html) => {
    const lead = await settle(html) // reads, then the race lands
    void lead // ...and the old path had already written its clear BEFORE the race, so the keep carried nothing
    return NO_LEAD
  })
  assert.equal(out.status, 200)
  assert.equal(f.rows.get(ID)!.ai_lead_text, RACED.text)
})

async function printingCopy(f: ReturnType<typeof fakeIO>, text: string, verdict: Record<string, unknown>, model: string) {
  // Make the stored copy one that prints a lead, with that lead on the draft.
  const html = new TextEncoder().encode(slotHtml([text]))
  f.objects.set(`${PET}/${ID}.html`, html)
  Object.assign(f.rows.get(ID)!, { content_sha256: await sha256Hex(html), ai_lead_text: text, ai_lead_verdict: verdict, ai_lead_model: model })
}

Deno.test('a pinned lead rewritten between the settle and the keep refuses the keep', async () => {
  const f = await savedOne()
  await printingCopy(f, 'Cooper ate well.', { outcome: 'printed', at: AT }, 'm')
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, racedSettle(f))
  assert.equal(out.status, 500)
  assert.equal(f.rows.get(ID)!.status, 'draft', 'never kept over text the vet did not get')
})

Deno.test('a rewrite with the SAME text but a new verdict or model still refuses the pinned keep (CUL-2523)', async () => {
  for (const change of [{ ai_lead_verdict: { outcome: 'printed', at: '2026-11-05T12:00:09.000Z' } }, { ai_lead_model: 'other-model' }]) {
    const f = await savedOne()
    await printingCopy(f, 'Cooper ate well.', { outcome: 'printed', at: AT }, 'm')
    const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, async (html) => {
      const lead = await settleLeadForKeep(plainSettleIO(f), html)
      Object.assign(f.rows.get(ID)!, change) // lands in the gap; the text is untouched
      return lead
    })
    assert.equal(out.status, 500, JSON.stringify(change))
    assert.equal(f.rows.get(ID)!.status, 'draft')
  }
})

Deno.test('an unraced pinned keep goes through, with the summary as printed', async () => {
  const f = await savedOne()
  await printingCopy(f, 'Cooper ate well.', { outcome: 'printed', at: AT }, 'm')
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, (html) => settleLeadForKeep(plainSettleIO(f), html))
  assert.deepEqual(out, { status: 200, body: { kept: true, first: true } })
  assert.equal(f.rows.get(ID)!.ai_lead_text, 'Cooper ate well.')
})

Deno.test('two long leads stamped in one millisecond: the keep never freezes the one the copy did not print (CUL-2574)', async () => {
  // Run A printed; run B lands in the gap with the same `at`, outcome, fact hash and model, and
  // different text. Before text_sha, a long text was pinned by those alone, so the keep matched
  // and froze B's text over a copy that printed A's.
  const textA = 'Cooper vomited on 3 days. '.repeat(100).trim()
  const textB = 'Cooper vomited on 4 days. '.repeat(100).trim()
  assert.ok(encodeURIComponent(textA).length > PIN_TEXT_URL_BUDGET)
  const verdict = async (t: string) => ({ outcome: 'printed', at: AT, fact_hash: 'h', text_sha: await textSha(t) })
  const f = await savedOne()
  await printingCopy(f, textA, await verdict(textA), 'm')
  const vB = await verdict(textB)
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'print' }, async (html) => {
    const lead = await settleLeadForKeep(plainSettleIO(f), html)
    Object.assign(f.rows.get(ID)!, { ai_lead_text: textB, ai_lead_verdict: vB }) // B lands
    return lead
  })
  assert.equal(out.status, 500)
  assert.equal(f.rows.get(ID)!.status, 'draft', 'never kept over text the vet did not get')
})

Deno.test('a failed undo leaves the row for the reaper: never an object no row names (F1)', async () => {
  const f = fakeIO({ failStamp: true })
  f.io.removeObjects = async (paths) => {
    f.log.push(`remove-failed ${paths.join(',')}`)
    return false
  }
  const out = await saveDraft(f.io, input, render, () => ID)
  assert.equal(out.saved, false)
  assert.ok(f.rows.has(ID), 'the row stays while its object does')
  assert.ok(!f.log.includes(`delete-row ${ID}`))
})

Deno.test('a draft past the keep window is never kept, so keep cannot race the reaper (F2)', async () => {
  const f = await savedOne()
  assert.ok(KEEP_WINDOW_MS < DRAFT_TTL_MS)
  f.rows.get(ID)!.created_at = new Date(NOW - KEEP_WINDOW_MS - 1).toISOString()
  const out = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)
  assert.deepEqual(out, { status: 409, body: { error: 'Saved copy expired' } })
  assert.equal(f.rows.get(ID)!.status, 'draft')
  f.rows.get(ID)!.created_at = new Date(NOW - KEEP_WINDOW_MS + 60_000).toISOString()
  assert.equal((await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)).status, 200)
})


// ── Opening a kept copy (PR-21, CUL-2301) ─────────────────────────────────────

async function keptCopy() {
  const f = fakeIO()
  const saved = await saveDraft(f.io, input, render, () => ID)
  assert.equal(saved.saved, true)
  const kept = await keepCopy(f.io, { reportId: ID, sharedVia: 'email' }, async () => NO_LEAD)
  assert.equal(kept.status, 200)
  return f
}

Deno.test('an open request names a well-formed id, or reads as none', () => {
  assert.deepEqual(parseOpenRequest({ mode: 'open', reportId: ID.toUpperCase() }), { reportId: ID })
  assert.deepEqual(parseOpenRequest({ mode: 'open', report_id: ID }), { reportId: ID })
  assert.deepEqual(parseOpenRequest({ mode: 'open', reportId: `${PET}/../x` }), { reportId: null })
  assert.equal(parseOpenRequest({ mode: 'keep', reportId: ID }), null)
  assert.equal(parseOpenRequest({ reportId: ID }), null)
})

Deno.test('a kept copy opens as the exact bytes it was sent with', async () => {
  const f = await keptCopy()
  const out = await openCopy(f.io, { reportId: ID })
  assert.equal(out.status, 200)
  assert.deepEqual(out.body, { html: `<html>report ${f.rows.get(ID)!.short_id}</html>` })
})

Deno.test('a draft never opens: it answers exactly as a missing id does', async () => {
  const f = fakeIO()
  await saveDraft(f.io, input, render, () => ID)
  const draft = await openCopy(f.io, { reportId: ID })
  const missing = await openCopy(f.io, { reportId: 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
  assert.equal(draft.status, 404)
  assert.deepEqual(draft, missing)
})

Deno.test('a stored file that no longer matches its frozen hash is refused, never shown', async () => {
  const f = await keptCopy()
  const path = f.rows.get(ID)!.storage_path
  f.objects.set(path, new TextEncoder().encode('<html>changed</html>'))
  const out = await openCopy(f.io, { reportId: ID })
  assert.equal(out.status, 409)
  assert.equal('html' in out.body, false)
})

Deno.test('a missing object, a failed read or a bad request shows nothing', async () => {
  const f = await keptCopy()
  f.objects.clear()
  // A download that fails is retryable (500); only a changed file is 409.
  assert.equal((await openCopy(f.io, { reportId: ID })).status, 500)
  assert.equal((await openCopy({ ...f.io, readRow: async () => 'error' as const }, { reportId: ID })).status, 500)
  assert.equal((await openCopy(f.io, { reportId: null })).status, 400)
})

Deno.test('the real row read names its row by id PAIRED WITH pet and verified maker (C-27; rls-privacy-reviewer F1)', async () => {
  // The one lock between "my own pet + someone else's report id" and their report. Driven through
  // the real savedCopyIO against a recording client, so deleting either filter reds here.
  const eqs: Array<[string, unknown]> = []
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => {
      eqs.push([c, v])
      return q
    },
    maybeSingle: async () => ({ data: null, error: null }),
  }
  const admin = { from: (t: string) => { assert.equal(t, 'vet_reports'); return q }, storage: { from: () => ({}) } }
  const io = savedCopyIO(admin as never, { petId: PET, uid: 'verified-uid' })
  assert.equal(await io.readRow(ID), null)
  assert.deepEqual(eqs, [['id', ID], ['pet_id', PET], ['generated_by', 'verified-uid']])
})

// ── PR-23b (CUL-2454): photos left out ─────────────────────────────────────────

Deno.test('PR-23b: the draft row records how many photos the owner left out; a bad count is 0', async () => {
  for (const [given, stored] of [[2, 2], [0, 0], [-1, 0], [1.5, 0], [Number.NaN, 0]] as const) {
    const f = fakeIO()
    const out = await saveDraft(f.io, { ...input, photosLeftOut: given }, render, () => ID)
    assert.equal(out.saved, true)
    assert.equal(f.rows.get(ID)!.photos_left_out, stored, `given ${given}`)
  }
})

Deno.test('PR-23b R6: a keep request never carries photos left out; the kept copy is the draft as rendered', () => {
  const k = parseKeepRequest({ mode: 'keep', reportId: ID, sharedVia: 'mail', photosLeftOut: [ID] } as Parameters<typeof parseKeepRequest>[0])
  assert.ok(k)
  assert.deepEqual(Object.keys(k).sort(), ['reportId', 'sharedAt', 'sharedVia'])
})
