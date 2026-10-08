// EN-4's two keys for the signed-in owner, for a screen that must follow a flip (Engines v3
// PR-28b, CUL-1436). The same question `floorOnNow` (lib/incidentFloorQueue.ts) asks at
// write time, and the server asks for the record's owner: `engines_v3_en4` AND
// `engines_v3_en3`. Fail-closed like every allowlist flag.
import { useAllowlistFlag } from './useAppConfig';

export function useFloorOn(): boolean {
  const en4 = useAllowlistFlag('engines_v3_en4');
  const en3 = useAllowlistFlag('engines_v3_en3');
  return en4 && en3;
}
