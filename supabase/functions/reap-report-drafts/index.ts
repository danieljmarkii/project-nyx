// Supabase Edge Function: reap-report-drafts (CUL-2437, CUL-2465; spec §11.1).
//
// Removes every unsent vet report draft older than 24 hours, and the AI summary stored on it:
// the stored HTML first, then the row (sweep.ts reapAllStaleDrafts). Migration 118's pg_cron
// job calls it every 15 minutes, so a draft leaves between 24 h and 24 h 15 m after it was made.
// Once a day a GitHub Actions schedule asks it whether any draft is overdue, and opens a Linear
// issue when one is or when the function cannot answer (CUL-2465).
// The request handling, and why an anon-key caller can do no harm, is ./handler.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleSweep } from './handler.ts'
import { globalSweepIO } from './sweep.ts'

Deno.serve((req: Request) =>
  handleSweep(req, {
    reaperIO: () => {
      const url = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !serviceRoleKey) return null
      return globalSweepIO(createClient(url, serviceRoleKey))
    },
  })
)
