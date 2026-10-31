// A stand-in for the supabase-js client, serving a verified dump to the unchanged
// `generateReportForPet` (CUL-2308).
//
// It implements the builder subset the loader calls (select, eq, is, gte, in, order, limit,
// range, maybeSingle, then) and models the SERVER, the way generate-report/index.test.ts's
// fake does since CUL-975: it pages on `.range()`, caps a response at `serverMaxRows`
// (PostgREST's `max-rows`), and returns `count` only when the query asked for it. So the
// shipped `fetchAll` pages and earns completeness here exactly as it does in production.
//
// It REFUSES rather than guesses. Any table and select pair not in reads.ts, an `.order()`
// sequence other than the one export.sql sorted by, or a filter on a column the rows do not
// carry that export.sql did not already apply: each is recorded in `refusals` and the query
// fails. The engine-flag read swallows its own errors (readEngineFlags fails closed), so a
// refusal there would not stop the report; run.deno.ts therefore exits non-zero on any
// refusal, wherever it happened.
//
// Filters on columns the rows DO carry are applied for real (`occurred_at` on events,
// `id` on medication_items, `key` on app_config). Ordering is not re-done: export.sql
// returns each read already in the loader's order, and this keeps it.

import { META_READ, READS, type ReadSpec, readFor } from './reads.ts'

export interface Dump {
  meta: DumpMeta
  /** Rows per read name, in the read's order. */
  rows: Record<string, unknown[]>
}

export interface DumpMeta {
  pet_id: string
  owner_id: string
  /** The statement's `now()`: every row in the dump is as of this instant, and the run's clock is set to it. */
  cutoff: string
}

type Row = Record<string, unknown>
interface Result {
  data: unknown
  error: { message: string } | null
  count: number | null
}

export interface StandIn {
  client: { from: (table: string) => unknown; auth: { getUser: () => Promise<never> } }
  /** Every query the stand-in would not serve. Non-empty means the run is not the shipped code's answer. */
  refusals: string[]
  /** The reads that were actually made, by name. */
  served: string[]
  /** Reads whose served pages did not cover every matching row: the run's own incompletePulls check. */
  shortReads: () => string[]
}

export function standInClient(dump: Dump, serverMaxRows = 1000): StandIn {
  const refusals: string[] = []
  const served: string[] = []
  // Per read: how many rows matched, and which of them some page handed over.
  const coverage = new Map<string, { total: number; delivered: Set<number> }>()

  const from = (table: string) => {
    let spec: ReadSpec | null = null
    let refused: string | null = null
    let wantsCount = false
    let single = false
    let lo = 0
    let hi = serverMaxRows - 1
    const orders: string[] = []
    const filters: ((r: Row) => boolean)[] = []
    const refuse = (why: string) => {
      if (refused === null) {
        refused = `${table}: ${why}`
        refusals.push(refused)
      }
    }
    const chain: Record<string, unknown> = {}
    const preApplied = (op: 'eq' | 'is', column: string, value: unknown): boolean =>
      spec !== null &&
      spec.preApplied.some(
        (p) => p.op === op && p.column === column && (p.value === '$pet' ? value === dump.meta.pet_id : p.value === value),
      )
    const carries = (column: string): boolean => {
      const rows = spec ? dump.rows[spec.name] ?? [] : []
      // A column the select names is carried even when the read is empty.
      return spec !== null && (spec.select.split(',').some((c) => c.trim() === column) || rows.some((r) => column in (r as Row)))
    }

    chain.select = (cols: string, opts?: { count?: string }) => {
      spec = readFor(table, cols)
      if (!spec) refuse(`no dumped read answers select "${cols}"`)
      if (opts?.count === 'exact') wantsCount = true
      return chain
    }
    chain.eq = (column: string, value: unknown) => {
      if (preApplied('eq', column, value)) return chain
      if (carries(column)) filters.push((r) => r[column] === value)
      else refuse(`eq(${column}) on a column the dump neither carries nor applied`)
      return chain
    }
    chain.is = (column: string, value: unknown) => {
      if (preApplied('is', column, value)) return chain
      if (carries(column)) filters.push((r) => r[column] === value)
      else refuse(`is(${column}) on a column the dump neither carries nor applied`)
      return chain
    }
    chain.gte = (column: string, value: string) => {
      if (!carries(column)) refuse(`gte(${column}) on a column the dump does not carry`)
      const floor = Date.parse(value)
      if (!Number.isFinite(floor)) refuse(`gte(${column}) with an unparseable bound`)
      filters.push((r) => typeof r[column] === 'string' && Date.parse(r[column] as string) >= floor)
      return chain
    }
    chain.in = (column: string, values: unknown[]) => {
      if (!carries(column)) refuse(`in(${column}) on a column the dump does not carry`)
      const set = new Set(values)
      filters.push((r) => set.has(r[column]))
      return chain
    }
    chain.order = (column: string, opts?: { ascending?: boolean }) => {
      if (opts?.ascending !== false) refuse(`order(${column}) ascending; export.sql sorts newest first`)
      orders.push(column)
      return chain
    }
    chain.limit = (n: number) => {
      hi = Math.min(hi, n - 1)
      return chain
    }
    chain.range = (f: number, t: number) => {
      lo = f
      hi = t
      return chain
    }

    const resolve = (): Result => {
      if (spec && orders.join(',') !== spec.order.join(',')) {
        refuse(`order (${orders.join(', ')}) is not the order export.sql sorted by (${spec.order.join(', ')})`)
      }
      if (refused !== null || !spec) return { data: null, error: { message: `stand-in refused ${refused}` }, count: null }
      served.push(spec.name)
      const all = (dump.rows[spec.name] ?? []) as Row[]
      const matching = all.filter((r) => filters.every((f) => f(r)))
      if (single) {
        if (matching.length > 1) return { data: null, error: { message: `${spec.name}: more than one row for maybeSingle` }, count: null }
        return { data: matching[0] ?? null, error: null, count: null }
      }
      const end = Math.min(hi + 1, lo + serverMaxRows, matching.length)
      const seen = coverage.get(spec.name) ?? { total: matching.length, delivered: new Set<number>() }
      seen.total = matching.length
      for (let i = lo; i < end; i++) seen.delivered.add(i)
      coverage.set(spec.name, seen)
      return { data: matching.slice(lo, end), error: null, count: wantsCount ? matching.length : null }
    }
    chain.maybeSingle = () => {
      single = true
      return Promise.resolve(resolve())
    }
    chain.then = (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    return chain
  }

  return {
    client: {
      from,
      // The run passes no caller JWT, so the loader never calls this. If it ever does, it is a refusal.
      auth: {
        getUser: () => {
          refusals.push('auth.getUser: the harness has no caller')
          return Promise.reject(new Error('stand-in has no auth'))
        },
      },
    },
    refusals,
    served,
    shortReads: () =>
      [...coverage.entries()]
        .filter(([, c]) => c.delivered.size < c.total)
        .map(([name, c]) => `${name}: ${c.delivered.size} of ${c.total} rows read`),
  }
}

/** Reads the loader must have made on any run (all but the conditional ones). */
export function requiredReads(): string[] {
  return READS.filter((r) => !r.conditional).map((r) => r.name)
}

export { META_READ }
