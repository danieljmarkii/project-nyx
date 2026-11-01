// The vet report preview's AI-summary states (Vet report v2 PR-25, CUL-2305; spec §9.2).
//
// The outcomes mirror LEAD_OUTCOMES in supabase/functions/generate-report/aiLead/leadPipeline.ts:
// the same question (what became of this draft's AI summary), so one list, checked equal by
// lib/reportAiLead.test.ts (C-34). The preview (VR2-17, CUL-2297) wires this; nothing renders it yet.
//
// One calm line for every way a summary did not print (spec §9.2): no reason given, because a
// cap, a decline and a failure all mean the same thing to the owner and the vet (the lines print
// on their own, complete), and no Premium mention anywhere (Pets > $; the summary is free on every
// tier under one cap). A summary the owner left out says so in their own terms.

export const REPORT_AI_LEAD_OUTCOMES = ['printed', 'left_out', 'declined', 'flag_off', 'capped', 'not_eligible', 'failed', 'rejected'] as const
export type ReportAiLeadOutcome = (typeof REPORT_AI_LEAD_OUTCOMES)[number]

export const AI_LEAD_NOT_THIS_TIME = 'No AI summary on this report. Every fact is in the lines below.'
export const AI_LEAD_LEFT_OUT = 'AI summary left out. Every fact is in the lines below.'
export const AI_LEAD_LEAVE_OUT_ACTION = 'Leave out the AI summary'

/** The preview's line under the Tick, or null when the summary prints (it shows itself) or when
 *  the flag is off for this owner (the feature does not exist for them, so nothing is said). */
export function aiLeadPreviewLine(outcome: ReportAiLeadOutcome): string | null {
  switch (outcome) {
    case 'printed':
    case 'flag_off':
      return null
    case 'left_out':
      return AI_LEAD_LEFT_OUT
    case 'declined':
    case 'capped':
    case 'not_eligible':
    case 'failed':
    case 'rejected':
      return AI_LEAD_NOT_THIS_TIME
  }
}
