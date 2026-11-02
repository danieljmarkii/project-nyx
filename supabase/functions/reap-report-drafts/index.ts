// Supabase Edge Function: reap-report-drafts (CUL-2437; spec §11.1).
//
// Removes every unsent vet report draft older than 24 hours, and the AI summary stored on it:
// the stored HTML first, then the row (savedCopy.ts reapAllStaleDrafts). Migration 118's pg_cron
// job calls it every 15 minutes, so a draft leaves between 24 h and 24 h 15 m after it was made.
// The request handling, and why an anon-key caller can do no harm, is ./handler.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { globalDraftReaperIO } from '../generate-report/savedCopy.ts'
import { handleSweep } from './handler.ts'

Deno.serve((req: Request) =>
  handleSweep(req, {
    reaperIO: () => {
      const url = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !serviceRoleKey) return null
      return globalDraftReaperIO(createClient(url, serviceRoleKey))
    },
  })
)
