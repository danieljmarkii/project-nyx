import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AI_LEAD_LEFT_OUT,
  AI_LEAD_NOT_THIS_TIME,
  REPORT_AI_LEAD_OUTCOMES,
  aiLeadPreviewLine,
} from './reportAiLead'

describe('aiLeadPreviewLine (spec §9.2)', () => {
  it('mirrors the server outcome list exactly (C-34: one question, one list)', () => {
    const src = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'generate-report', 'aiLead', 'leadPipeline.ts'), 'utf8')
    const m = src.match(/export const LEAD_OUTCOMES = \[([^\]]*)\] as const/)
    expect(m).not.toBeNull()
    const server = (m as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect([...REPORT_AI_LEAD_OUTCOMES]).toEqual(server)
  })

  it('gives one calm line for every way the summary did not print, and none when it did', () => {
    expect(aiLeadPreviewLine('printed')).toBeNull()
    expect(aiLeadPreviewLine('flag_off')).toBeNull()
    expect(aiLeadPreviewLine('left_out')).toBe(AI_LEAD_LEFT_OUT)
    for (const o of ['declined', 'capped', 'not_eligible', 'failed', 'rejected'] as const) {
      expect(aiLeadPreviewLine(o)).toBe(AI_LEAD_NOT_THIS_TIME)
    }
  })

  it('never mentions Premium, a price, a cap or an error, and never exclaims (Pets > $, nyx-voice)', () => {
    for (const o of REPORT_AI_LEAD_OUTCOMES) {
      const line = aiLeadPreviewLine(o) ?? ''
      expect(line).not.toMatch(/premium|upgrade|price|\$|limit|cap\b|error|failed|!/i)
    }
  })
})
