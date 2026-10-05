// EN-14's client gate (Engines v3 PR-36, CUL-1419), on its own so a read-only surface (Home's
// follow-up line) can import it without the notification shell that writes the preference
// (Home's closure is scanned for writes by effect, guards/homeWrites.test.ts).
//
// `engines_v3_en14` resolves fail-closed: absent, unreachable or malformed reads off, so the
// build ships dark (PMD-12 keeps the allowlist to the PM's account, CUL-1313).
import { useAllowlistFlag } from './useAppConfig';

export const EN14_FLAG = 'engines_v3_en14' as const;

export function useEn14(): boolean {
  return useAllowlistFlag(EN14_FLAG);
}
