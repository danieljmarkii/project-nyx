// Get ready's Signal rows, under Design v2 (GC-4 PR 3 · CUL-1570): the sentence each counted
// finding's own screen states, so "Worth raising" quotes the number the Signal screen and Home's
// row already carry (CUL-1568, CUL-1569) rather than the engine's cached words over the engine's
// windows. The read is the screen's own loader (`loadSignalScreen`), the one the row's door
// opens, for the same pet and clock: one count by construction, never a second count here.
//
// Only a COMPOSED sentence is taken. Where the screen kept the engine's words (the escalate-only
// gate, a masking span, a floor read) the cached sentence is the screen's sentence too, and the
// page quotes it as it always did. Read only with the redesign on (the caller's gate).

import type { CachedFinding } from './signal';
import { isCountedFinding } from './signalCounts';
import { foldIdentity } from './signalFold';
import { loadSignalScreen } from './signalScreen';
import { screenSentenceKey } from './getReady';

export async function readScreenSentences(
  petId: string,
  findings: readonly CachedFinding[],
  nowMs: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    findings
      .filter((f) => isCountedFinding(f.finding))
      .map(async (f) => {
        try {
          const load = await loadSignalScreen(petId, foldIdentity(f.finding), nowMs);
          if (load.status !== 'ready' || load.model.composed == null) return;
          // The loader finds the finding by identity in its own read of the cache; a sentence is
          // quoted only beside the very finding it was composed from.
          const key = screenSentenceKey(f.finding);
          if (screenSentenceKey(load.model.finding) !== key) return;
          out.set(key, load.model.sentence);
        } catch (e) {
          // A failed read quotes the cached sentence (C-12: never an empty row, never a guess).
          console.warn('[Get ready] Signal screen read failed:', e);
        }
      }),
  );
  return out;
}
