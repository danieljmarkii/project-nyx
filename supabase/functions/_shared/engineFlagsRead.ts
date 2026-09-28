// Supabase Edge Functions shared module — the Engines v3 flag READ (Engines v3 PR-11a).
// The resolution, the keys and the fail-closed rules are engineFlags.ts (pure); this file
// is the one query, kept apart so engineFlags.ts imports nothing remote.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ENGINE_KEYS, resolveEngineFlags, type EngineFlags } from './engineFlags.ts'

// Any client that can read app_config (every signed-in client can: GAP-26 / B-744). A
// throw is a read that did not answer, never an absent key.
export async function readEngineFlags(
  client: SupabaseClient,
  ownerUid: string | null,
): Promise<EngineFlags> {
  try {
    const result = await client.from('app_config').select('key, value').in('key', [...ENGINE_KEYS])
    return resolveEngineFlags(result, ownerUid)
  } catch {
    return { on: [], readOk: false }
  }
}
