// EN-5's client gate (Engines v3 PR-30q, CUL-1724): the question under a vomit read.
//
// `engines_v3_en5` resolves fail-closed: absent, unreachable or malformed reads off, so the
// build ships dark (097 seeds it off; the allowlist stays the PM's account, CUL-1313).
import { useAllowlistFlag } from './useAppConfig';

export const EN5_FLAG = 'engines_v3_en5' as const;

export function useEn5(): boolean {
  return useAllowlistFlag(EN5_FLAG);
}
