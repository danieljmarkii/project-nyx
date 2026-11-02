// report-visit-link's service-role I/O (Vet report v2 PR-22, CUL-2302).
//
// Its own module so a test can drive it (io.test.ts): RLS does not scope the service role, and
// for it 109's and 113's same-pet triggers check only the pet, never the caller. So the uid
// pairing on each query below is the ONLY thing that stops one account re-filing another's kept
// copy, and it is pinned by test rather than trusted (rls-privacy-reviewer residual 1).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { LinkIO, LinkTarget } from './handler.ts'

/** The four calls the handler makes, every one scoped to `uid`. */
export function buildIO(admin: SupabaseClient, uid: string): LinkIO {
  return {
    async petIsCallers(petId) {
      const { data, error } = await admin.from('pets').select('id').eq('id', petId).eq('user_id', uid).maybeSingle()
      if (error) return 'error'
      return data !== null
    },
    async readReport(petId, reportId) {
      const { data, error } = await admin
        .from('vet_reports')
        .select('status')
        .eq('id', reportId)
        .eq('pet_id', petId)
        .eq('generated_by', uid)
        .maybeSingle()
      if (error) return 'error'
      return data === null ? null : { status: String((data as { status: unknown }).status) }
    },
    async targetIsPets(petId, target: LinkTarget) {
      // The pet is the caller's (checked first, above), so "same pet" here is also "the caller's".
      if (target.kind === 'visit') {
        const { data, error } = await admin
          .from('vet_visits')
          .select('id')
          .eq('id', target.id)
          .eq('pet_id', petId)
          .is('deleted_at', null)
          .maybeSingle()
        if (error) return 'error'
        return data !== null
      }
      const { data, error } = await admin
        .from('vet_appointments')
        .select('id')
        .eq('id', target.id)
        .eq('pet_id', petId)
        .is('deleted_at', null)
        .is('cancelled_at', null)
        .maybeSingle()
      if (error) return 'error'
      return data !== null
    },
    async writeLinks(petId, reportId, links) {
      const { data, error } = await admin
        .from('vet_reports')
        .update(links)
        .eq('id', reportId)
        .eq('pet_id', petId)
        .eq('generated_by', uid)
        .eq('status', 'kept')
        .select('id')
      if (error) return 'error'
      return Array.isArray(data) ? data.length : 0
    },
  }
}
