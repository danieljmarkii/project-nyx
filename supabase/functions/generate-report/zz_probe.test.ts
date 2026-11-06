import { buildDocumentV2 } from './documentV2.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'
Deno.test('probe', () => {
  for (const [name, snap] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()]] as const) {
    const doc = buildDocumentV2(snap as never, { owner: null, shortId: null, questions: [] } as never)
    const b = doc.blocks.find((x) => x.kind === 'carried' && (x as { id: string }).id === 'protein-timeline') as { html: string } | undefined
    if (!b) continue
    const t = (snap as any).proteinTimeline
    console.log('##', name, 'zeroWithheld=', t.zeroWithheld, 'meal', JSON.stringify(t.mealDaysByBucket), 'scope', JSON.stringify(t.scopeDaysByBucket), JSON.stringify(t.weekStartDates))
    console.log(b.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
  }
})
