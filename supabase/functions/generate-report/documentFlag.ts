// The `report_document_v2` server check (CUL-2290; v2 spec §12, PM ruling (a) on CUL-2290).
//
// v2 renders only when the caller asked for it AND this resolves true. It resolves against the
// JWT-verified uid (`auth.getUser`), never a body value and never the pet row's owner, and FAILS
// CLOSED: no JWT, an auth error, a failed or missing `app_config` read, or a malformed value all
// read false, and the caller gets the v1 document every owner gets today.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveAllowlistFlagFromRows } from '../_shared/flags.ts'
import { REPORT_DOCUMENT_FLAG } from '../_shared/reportSummaryGate.ts'

export { REPORT_DOCUMENT_FLAG }

export async function reportDocumentV2On(client: SupabaseClient, callerJwt: string | null): Promise<boolean> {
  if (!callerJwt) return false
  try {
    const { data, error } = await client.auth.getUser(callerJwt)
    const uid = data?.user?.id ?? null
    if (error || typeof uid !== 'string' || uid === '') return false
    const res = await client.from('app_config').select('key, value').eq('key', REPORT_DOCUMENT_FLAG)
    if (res.error) return false
    return resolveAllowlistFlagFromRows(res.data as { key: string; value: unknown }[] | null, REPORT_DOCUMENT_FLAG, uid, false)
  } catch {
    return false
  }
}
