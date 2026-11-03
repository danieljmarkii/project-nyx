// The daily vet report draft check (CUL-2465, PM ruling (a) 2026-11-03).
//
// WHY IT EXISTS. reap-report-drafts removes every unsent draft (and the AI summary on it) 24 h
// after it was made, called by pg_cron every 15 minutes. pg_cron records only that the call was
// queued, and pg_net purges the HTTP answer after about 6 h, so a sweep that stopped (a rotated
// anon key, an undeployed function, Storage failing, a row that cannot be deleted) was seen by no
// one. This asks the outcome instead: is any draft older than 25 h? It runs from GitHub Actions,
// not pg_cron, so a dead pg_cron does not take the check down with it.
//
// WHAT REACHES A PERSON. On "overdue", and on any answer that is not a clean yes or no (a 401,
// 404, 500 or timeout: the check could not run), it opens ONE issue in Linear (team Culprit), or
// comments on the open one it opened before, so a stall that lasts a week is one issue. The run
// then exits non-zero, so GitHub's failed-run email is a second channel when Linear itself is down.
//
// WHAT LEAVES. The function answers one bit; this sends Linear that bit, the HTTP status when the
// check failed, the date and the run's URL. No pet, owner, report id, count or age exists here to send.

export const PROJECT_URL = 'https://aigchluqluzuhtbfllgh.supabase.co'
export const CHECK_BODY = { check: 'overdue' } as const
export const CHECK_TIMEOUT_MS = 30_000
export const LINEAR_TIMEOUT_MS = 20_000

/** Team Culprit, and CUL-2465 (the issue this check exists for), by their Linear ids. */
export const LINEAR_TEAM_ID = '7d624e99-9819-4232-b53e-6f7306837df0'
export const PARENT_ISSUE_ID = '01db6231-7da1-4b57-9b26-49facfa4e324'
// `Waiting on PM` too: CLAUDE.md routes live harm touching privacy onto the PM queue (rls-privacy-reviewer F3).
export const LABEL_NAMES = ['Live harm', 'Area: Privacy/RLS', 'Waiting on PM'] as const

/** The marker: one open issue with this exact title is the thread every later day comments on. */
export const ISSUE_TITLE = 'Vet report drafts: the daily check found a draft past its day, or could not run'

export type CheckOutcome =
  | { kind: 'none' }
  | { kind: 'overdue' }
  | { kind: 'unreachable'; detail: string }

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ status: number; ok: boolean; json(): Promise<unknown>; text(): Promise<string> }>

/** Ask the deployed function. Anything but a clean 204 or a 200 `{overdue: true}` is "could not run". */
export async function askReaper(fetchFn: FetchLike, anonKey: string, timeoutMs: number = CHECK_TIMEOUT_MS): Promise<CheckOutcome> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchFn(`${PROJECT_URL}/functions/v1/reap-report-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify(CHECK_BODY),
      signal: ctl.signal,
    })
    if (res.status === 204) return { kind: 'none' }
    if (res.status === 200) {
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      if (body !== null && typeof body === 'object' && (body as Record<string, unknown>).overdue === true) return { kind: 'overdue' }
      return { kind: 'unreachable', detail: 'HTTP 200 with an unexpected body' }
    }
    return { kind: 'unreachable', detail: `HTTP ${res.status}` }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { kind: 'unreachable', detail: aborted ? `no answer in ${timeoutMs / 1000} s` : 'the request failed before an answer' }
  } finally {
    clearTimeout(timer)
  }
}

/** The day's line: what was found, in plain words, and where to look. */
export function findingText(outcome: Exclude<CheckOutcome, { kind: 'none' }>, dayIso: string, runUrl: string | null): string {
  const run = runUrl ? `\n\nRun: ${runUrl}` : ''
  if (outcome.kind === 'overdue') {
    return `**${dayIso}: at least one unsent vet report draft is older than 25 hours.** The 15-minute sweep ` +
      `(reap-report-drafts) should have removed it, and any AI summary on it, by 24 h 15 m. Either the sweep ` +
      `has stopped, or a draft will not delete.${run}`
  }
  return `**${dayIso}: the daily check could not reach the draft sweep (${outcome.detail}).** The same function, ` +
    `key and URL serve the 15-minute sweep, so the sweep is probably not running either.${run}`
}

export function issueDescription(first: string): string {
  return [
    'TL;DR — plain English: Unsent vet report drafts are supposed to be deleted, with any AI summary on them, ' +
      'a day after they are made. The daily check found that this is not happening, or could not tell. Until it ' +
      'is fixed, drafts, and any AI summary on them, are kept longer than we promise.',
    'Direction: QUIET',
    '',
    '---',
    '',
    first,
    '',
    '**Triage** (Supabase SQL editor, read-only):',
    '',
    '```sql',
    "SELECT count(*), min(created_at) FROM public.vet_reports WHERE status = 'draft' AND created_at < now() - interval '25 hours';",
    "SELECT jobname, active FROM cron.job WHERE jobname = 'reap-vet-report-drafts';",
    "SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 10; -- the last ~6 h only",
    '```',
    '',
    'Then the function logs for `reap-report-drafts` (its `reaped N, failed N` line). A non-zero `failed` with the ' +
      'job running is a draft that will not delete; a 401 or 404 in `net._http_response` is the key or the deploy.',
    '',
    'Each later day this is still true adds a comment here instead of a new issue. Close it once the first query returns 0.',
    '',
    '— opened by `.github/workflows/report-drafts-check.yml` (CUL-2465)',
  ].join('\n')
}

// ── Linear ───────────────────────────────────────────────────────────────────

export type GraphQL = (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>

export function linearGraphQL(fetchFn: FetchLike, apiKey: string): GraphQL {
  return async (query, variables) => {
    const res = await fetchFn('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      // Bounded, so a hung Linear still ends in a logged exit 2 rather than the job's timeout.
      signal: AbortSignal.timeout(LINEAR_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> } | null
    if (!res.ok || body === null || body.errors?.length || !body.data) {
      // The error's message only: never the request, which carries the key in a header.
      throw new Error(`Linear answered HTTP ${res.status}: ${body?.errors?.map((e) => e.message).join('; ') ?? 'no body'}`)
    }
    return body.data
  }
}

const FIND_OPEN = `query ($team: ID!, $title: String!) {
  issues(first: 1, filter: { team: { id: { eq: $team } }, title: { eq: $title }, state: { type: { nin: ["completed", "canceled"] } } }) {
    nodes { id identifier url }
  }
}`
const FIND_LABELS = `query ($team: ID!, $names: [String!]) {
  issueLabels(first: 10, filter: { name: { in: $names }, or: [{ team: { id: { eq: $team } } }, { team: { null: true } }] }) {
    nodes { id name }
  }
}`
const CREATE = `mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`
const COMMENT = `mutation ($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`
const RELATE = `mutation ($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`

type IssueRef = { id: string; identifier: string; url: string }

/** One open issue per stall: comment on it if it is there, else open it. Returns what it did. */
export async function report(gql: GraphQL, text: string): Promise<{ action: 'commented' | 'opened'; issue: IssueRef }> {
  const found = (await gql(FIND_OPEN, { team: LINEAR_TEAM_ID, title: ISSUE_TITLE })) as { issues?: { nodes?: IssueRef[] } }
  const open = found.issues?.nodes?.[0]
  if (open) {
    await gql(COMMENT, { input: { issueId: open.id, body: text } })
    return { action: 'commented', issue: open }
  }
  // Labels are looked up by name, so a renamed label costs the label, never the issue.
  let labelIds: string[] = []
  try {
    const labels = (await gql(FIND_LABELS, { team: LINEAR_TEAM_ID, names: [...LABEL_NAMES] })) as { issueLabels?: { nodes?: Array<{ id: string }> } }
    labelIds = (labels.issueLabels?.nodes ?? []).map((l) => l.id)
  } catch {
    labelIds = []
  }
  const created = (await gql(CREATE, {
    input: { teamId: LINEAR_TEAM_ID, title: ISSUE_TITLE, description: issueDescription(text), priority: 2, labelIds },
  })) as { issueCreate?: { success?: boolean; issue?: IssueRef } }
  const issue = created.issueCreate?.issue
  if (!created.issueCreate?.success || !issue) throw new Error('Linear did not create the issue')
  try {
    await gql(RELATE, { input: { issueId: issue.id, relatedIssueId: PARENT_ISSUE_ID, type: 'related' } })
  } catch {
    // The relation is a convenience; the issue itself is the alert.
  }
  return { action: 'opened', issue }
}

/** The whole check. Exit code: 0 when no draft is overdue; 1 when a person was told; 2 when they could not be. */
export async function runCheck(deps: {
  fetchFn: FetchLike
  anonKey: string
  linearApiKey: string | undefined
  dayIso: string
  runUrl: string | null
  log: (line: string) => void
}): Promise<number> {
  const outcome = await askReaper(deps.fetchFn, deps.anonKey)
  if (outcome.kind === 'none') {
    deps.log('No vet report draft is older than 25 hours.')
    return 0
  }
  const text = findingText(outcome, deps.dayIso, deps.runUrl)
  deps.log(outcome.kind === 'overdue' ? 'A draft is older than 25 hours.' : `The check could not run: ${outcome.detail}.`)
  if (!deps.linearApiKey) {
    deps.log('LINEAR_API_KEY is not set, so no Linear issue was opened. This failed run is the only alert.')
    return 2
  }
  try {
    const done = await report(linearGraphQL(deps.fetchFn, deps.linearApiKey), text)
    deps.log(`Linear: ${done.action} ${done.issue.identifier} (${done.issue.url}).`)
    return 1
  } catch (e) {
    deps.log(`Linear could not be reached: ${e instanceof Error ? e.message : String(e)}. This failed run is the only alert.`)
    return 2
  }
}
