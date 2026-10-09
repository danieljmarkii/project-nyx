// The go-live day of EN-3's new rule for the signed-in owner (Engines v3 PR-27k, CUL-1513):
// the `live_since` day carried in `engines_v3_en3`'s own `app_config` value, and only while
// the key is on for this caller. Off, unseeded, or carrying no day, it is null and every
// dated line renders nothing (`lib/ruleSeam.ts`). Render-only, like every flag read here.
import { liveSinceOf } from '../lib/ruleSeam';
import { useAllowlistFlag, useAllowlistFlagsRaw } from './useAppConfig';

export function useEn3LiveSince(): string | null {
  const on = useAllowlistFlag('engines_v3_en3');
  const raw = useAllowlistFlagsRaw().engines_v3_en3;
  return on ? liveSinceOf(raw) : null;
}
