// The consent gate's discovery guard (CUL-552 PR 2). Run with:
// deno test --allow-read=supabase/functions supabase/functions/_shared/aiConsent.guard.test.ts
//
// D10 is the whole boundary: every Anthropic call the server makes is behind the owner's
// recorded yes. A file that reaches Anthropic (its endpoint or its key) is discovered here
// from the REPOSITORY, never from a list (C-38: a floor derived from the constant under test
// cannot see a removal), and must be registered below with the gate it holds. A sixth caller
// added later reds this suite until it is gated and registered.
//
// What each registered file must show: it imports the one reader, and calls it with the
// uid `auth.getUser()` verified (`user.id`), never a body value. Each file's ORDER (the gate
// before any unit, download or model call) is pinned where its behaviour is tested:
//   _shared/incident-analysis.ts      incident-analysis.pipeline.test.ts (driven end to end)
//   generate-signal/index.ts          generate-signal/index.test.ts (source pin)
//   ask/index.ts                      ask/index.test.ts (source pin)
//   extract-*-from-photo/index.ts     the pins below
//
// Blind spots, stated so they do not read as coverage: a model call through a third-party
// SDK that names neither the endpoint nor the key would not be discovered, and nothing here
// proves the gate's result is USED beyond the order pins (the per-file suites do that).

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { blankComments, sourceFiles } from './sourceScan.testutil.ts'

const ROOT = new URL('../', import.meta.url) // supabase/functions/

const REGISTERED: Record<string, string> = {
  '_shared/incident-analysis.ts': 'photo reads (analyze-vomit, analyze-stool, Ask A8): consent_declined gate → read_disabled / contextual escalation',
  'generate-signal/index.ts': 'Signal phrasing: modelPhrasingAllowed(flag, consent) → templates',
  'ask/index.ts': 'Ask: consent_off deflection before any unit or model call',
  'extract-food-from-photo/index.ts': 'food extraction: feature_disabled before the gate config, the counter and the download',
  'extract-medication-from-photo/index.ts': 'medication extraction: feature_disabled before the gate config, the counter and the download',
}

const REACHES_ANTHROPIC = /api\.anthropic\.com|ANTHROPIC_API_KEY/

async function read(rel: string): Promise<string> {
  return blankComments(await Deno.readTextFile(new URL(rel, ROOT)))
}

Deno.test('consent guard — every file that reaches Anthropic is registered, and every registered file still does', async () => {
  const found: string[] = []
  for await (const url of sourceFiles(ROOT)) {
    const rel = url.pathname.slice(ROOT.pathname.length)
    if (rel === '_shared/aiConsent.ts') continue // the reader itself names neither
    if (REACHES_ANTHROPIC.test(blankComments(await Deno.readTextFile(url)))) found.push(rel)
  }
  assertEquals(found.sort(), Object.keys(REGISTERED).sort())
})

Deno.test('consent guard — every registered file reads consent through the one reader, for the verified uid', async () => {
  for (const rel of Object.keys(REGISTERED)) {
    const src = await read(rel)
    assert(/import \{[^}]*\breadAiBoundaryConsent\b[^}]*\} from '(\.\.\/_shared|\.)\/aiConsent\.ts'/.test(src), `${rel} does not import the consent reader`)
    // The first argument is a client expression (one level of parens: `serviceClient()`).
    const calls = src.match(/readAiBoundaryConsent\((?:[^()]|\([^()]*\))*\)/g) ?? []
    assert(calls.length >= 1, `${rel} never calls the consent reader`)
    for (const c of calls) assert(/,\s*user\.id\)$/.test(c), `${rel} reads consent for something other than the verified uid: ${c}`)
    // No hand-rolled read of the table beside the reader.
    assert(!/from\('ai_consent'\)/.test(src), `${rel} reads ai_consent directly instead of through the reader`)
  }
})

for (const rel of ['extract-food-from-photo/index.ts', 'extract-medication-from-photo/index.ts']) {
  Deno.test(`consent guard — ${rel}: declined returns feature_disabled before the gate config, the counter, the download and the model`, async () => {
    const src = await read(rel)
    const handler = src.slice(src.indexOf('const handler = async'))
    const gate = handler.indexOf('if (!(await readAiBoundaryConsent(adminClient, user.id))) return featureDisabledResponse()')
    assert(gate > 0, 'the declined branch is gone or no longer returns feature_disabled')
    assert(handler.indexOf('auth.getUser()') < gate, 'the gate runs before the uid is verified')
    for (const must of ['readGateConfig(', 'recordUsage(']) assert(handler.includes(must), `${must} left the handler: re-point this pin`)
    for (const after of ['readGateConfig(', 'recordUsage(', 'fetchUsableImageBlob(', '.download(', 'runVisionCall(', 'fetchWithTimeout(']) {
      const at = handler.indexOf(after)
      if (at >= 0) assert(at > gate, `${after} runs before the consent gate`)
    }
    assertEquals(handler.split('readAiBoundaryConsent(').length - 1, 1, 'a second consent read in the handler')
  })
}
