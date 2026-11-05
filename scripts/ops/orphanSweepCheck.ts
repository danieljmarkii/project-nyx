// The daily orphaned-storage check (CUL-2521, PM ruling 2026-11-05: an outcome check, not a run-line heartbeat).
//
// WHY IT EXISTS. sweep-orphaned-storage runs once a day (09:23 UTC, pg_cron, migration 120) and removes the
// files of pets, foods and accounts that are gone. pg_cron records only that the POST was queued and pg_net
// purges the answer after about 6 h, so a sweep that stopped (cron.timezone moved, a rotated anon key, a dead
// pg_net worker, a database down at 09:23, a run whose reads all failed) was seen by no one, and deleted
// owners' health files stayed on the server.
//
// WHAT IT ASKS. Not "did a run line appear" (reading the function's logs takes a Supabase account token, which
// can do anything to the project), but the outcome: in its own afternoon window the function repeats the pass
// with a remove that deletes nothing, judging each file's age at the morning run's start. A file that was due
// then and is still here means the morning run did not do its job, whatever the reason; a pass that could not
// read everything says so. It runs from GitHub Actions, not pg_cron, so a dead pg_cron does not take the check
// down with it.
//
// WHAT IT CANNOT SEE, stated. A stopped sweep with nothing to remove raises nothing, because nothing is at risk;
// the first file past due raises it the same day. Folder-level oddities whose owner was never proved gone (a
// non-uuid top-level folder, a file at a bucket's root, an unknown bucket) do not alert. And a folder whose owner was deleted after the morning run
// started, still holding files delete-account's own sweep missed, reads as overdue: a louder answer about a
// real leftover, never a quieter one.
//
// WHAT REACHES A PERSON, and what leaves: as the draft check (./reportDraftsCheck.ts). One Linear issue per
// stall, commented on each later day; the run exits non-zero so GitHub's failed-run email is a second channel,
// and the only one until LINEAR_API_KEY is set (CUL-2518). The function answers two bits; this sends Linear
// those bits, the HTTP status when the check failed, the date and the run's URL. No id, path or count.

import { linearGraphQL, PROJECT_URL, report, type FetchLike, type IssueSpec } from './reportDraftsCheck.ts'

export const CHECK_BODY = { check: 'overdue' } as const
// The pass lists every bucket: longer than the draft check's single read.
export const CHECK_TIMEOUT_MS = 150_000

/** CUL-2521, the issue this check exists for, by its Linear id. */
export const PARENT_ISSUE_ID = 'faac12f6-0ef7-4286-ad3a-f3bfa9965b76'
export const LABEL_NAMES = ['Live harm', 'Area: Privacy/RLS', 'Waiting on PM'] as const
export const ISSUE_TITLE = 'Orphaned storage: the daily check found files the sweep should have removed, or could not run'

export type CheckOutcome =
  | { kind: 'none' }
  | { kind: 'found'; overdue: boolean; incomplete: boolean }
  | { kind: 'unreachable'; detail: string }

/** Ask the deployed function. Anything but a clean 204 or a 200 naming at least one bit is "could not run". */
export async function askSweep(fetchFn: FetchLike, anonKey: string, timeoutMs: number = CHECK_TIMEOUT_MS): Promise<CheckOutcome> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchFn(`${PROJECT_URL}/functions/v1/sweep-orphaned-storage`, {
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
      const b = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null
      // Both bits must be booleans and at least one true: a 200 that names nothing is not a clean answer.
      if (b && typeof b.overdue === 'boolean' && typeof b.incomplete === 'boolean' && (b.overdue || b.incomplete)) {
        return { kind: 'found', overdue: b.overdue, incomplete: b.incomplete }
      }
      return { kind: 'unreachable', detail: 'HTTP 200 with an unexpected body' }
    }
    // 400 here is most often a check that started outside its 12:07–14:07 UTC window (a late GitHub schedule).
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
  if (outcome.kind === 'unreachable') {
    return `**${dayIso}: the daily check could not reach the orphaned-storage sweep (${outcome.detail}).** The same ` +
      `function, key and URL serve the 09:23 UTC run, so the run may not be working either.${run}`
  }
  const parts: string[] = []
  if (outcome.overdue) {
    parts.push('files of a deleted pet, food or account that were due for removal at this morning\'s 09:23 UTC run are still stored, ' +
      'or are stored in a shape the sweep cannot remove (the run line\'s `file_unknown_shape` / `file_no_timestamp`)')
  }
  if (outcome.incomplete) parts.push('the check could not read every bucket or owner, so it cannot vouch for the rest')
  return `**${dayIso}: ${parts.join('; and ')}.**${run}`
}

export function issueDescription(first: string): string {
  return [
    'TL;DR — plain English: Once a day a clean-up job removes the photos and files of pets, foods and accounts ' +
      'that were deleted. The daily check found that it did not, or could not tell. Until it is fixed, health files ' +
      'of deleted owners stay on the server longer than we promise.',
    'Direction: QUIET',
    '',
    '---',
    '',
    first,
    '',
    '**Triage** (Supabase SQL editor, read-only):',
    '',
    '```sql',
    "SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'sweep-orphaned-storage';",
    "SELECT current_setting('cron.timezone', true);",
    "SELECT status, start_time FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sweep-orphaned-storage') ORDER BY start_time DESC LIMIT 5;",
    'SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 10; -- the last ~6 h only',
    '```',
    '',
    'Then the function logs for `sweep-orphaned-storage`: the morning `sweep-orphaned-storage.run` line (its `left` ' +
      'reasons say which reads failed) and the afternoon `sweep-orphaned-storage.check` line. A 400 in ' +
      '`net._http_response` is the schedule outside the run window; a 401 is the key.',
    '',
    'Each later day this is still true adds a comment here instead of a new issue. Close it once a check runs clean.',
    '',
    '— opened by `.github/workflows/orphan-sweep-check.yml` (CUL-2521)',
  ].join('\n')
}

export const ORPHAN_ISSUE: IssueSpec = {
  title: ISSUE_TITLE,
  description: issueDescription,
  parentIssueId: PARENT_ISSUE_ID,
  labelNames: LABEL_NAMES,
}

/** The whole check. Exit code: 0 when nothing due was left; 1 when a person was told; 2 when they could not be. */
export async function runCheck(deps: {
  fetchFn: FetchLike
  anonKey: string
  linearApiKey: string | undefined
  dayIso: string
  runUrl: string | null
  log: (line: string) => void
}): Promise<number> {
  const outcome = await askSweep(deps.fetchFn, deps.anonKey)
  if (outcome.kind === 'none') {
    deps.log('Nothing the morning sweep should have removed is still stored, and the check read everything.')
    return 0
  }
  const text = findingText(outcome, deps.dayIso, deps.runUrl)
  deps.log(outcome.kind === 'unreachable' ? `The check could not run: ${outcome.detail}.` : text.replace(/\*\*/g, ''))
  if (!deps.linearApiKey) {
    deps.log('LINEAR_API_KEY is not set, so no Linear issue was opened. This failed run is the only alert.')
    return 2
  }
  try {
    const done = await report(linearGraphQL(deps.fetchFn, deps.linearApiKey), text, ORPHAN_ISSUE)
    deps.log(`Linear: ${done.action} ${done.issue.identifier} (${done.issue.url}).`)
    return 1
  } catch (e) {
    deps.log(`Linear could not be reached: ${e instanceof Error ? e.message : String(e)}. This failed run is the only alert.`)
    return 2
  }
}
