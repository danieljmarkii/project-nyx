// The daily vet report draft check's I/O shell (CUL-2465). Run by
// .github/workflows/report-drafts-check.yml:
//
//   LINEAR_API_KEY=… node --experimental-strip-types scripts/ops/reportDraftsCheck.cli.ts
//
// The anon key is read from eas.json's production profile rather than copied here, so a rotated key
// (which also means re-running 118's cron.schedule) cannot leave this check calling with the old one.
// The logic, and why the call is safe with a public key, is ./reportDraftsCheck.ts.

import * as fs from 'node:fs'
import { runCheck } from './reportDraftsCheck.ts'

function anonKeyFromEas(): string {
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8')) as { build?: Record<string, { env?: Record<string, string> }> }
  const key = eas.build?.production?.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('eas.json has no production EXPO_PUBLIC_SUPABASE_ANON_KEY')
  return key
}

const server = process.env.GITHUB_SERVER_URL
const repo = process.env.GITHUB_REPOSITORY
const runId = process.env.GITHUB_RUN_ID

runCheck({
  fetchFn: fetch,
  anonKey: anonKeyFromEas(),
  linearApiKey: process.env.LINEAR_API_KEY || undefined,
  dayIso: new Date().toISOString().slice(0, 10),
  runUrl: server && repo && runId ? `${server}/${repo}/actions/runs/${runId}` : null,
  log: (line) => console.log(line),
}).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`The check itself broke: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  },
)
