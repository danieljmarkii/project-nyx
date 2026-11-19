// Vet contacts on the vet report (CUL-2770, Vet contacts PR-08; spec
// docs/nyx-vet-contacts-requirements.md §4.7, AC 6–8 and 19).
//
// WHAT THIS FILE DOES, AND WHAT IT NEVER DOES.
//   * It LISTS every `vet_visits` row (an exam, a call, texts, an email) whose day falls inside the
//     report's window, in date order, and names the courses each one started. A list, never a count:
//     a contact is provenance, not an observation of the animal (guards/visitReaders.test.ts).
//   * It names a course's source when that source is a call, texts or an email, so "ear drops,
//     started Nov 9" with no exam on record no longer reads as self medication (spec §1, Dr. Chen).
//   * It NEVER moves the window. The window is `resolveScope`'s rung 1 over the EXAM-only pull
//     (CUL-2765, R8); this module receives the scope already resolved and only filters by it. An
//     edited channel (R12) moves the window because the exam pull reads the row as it stands, and
//     this list follows the same row, so the two can never disagree about which day was the exam.
//   * It NEVER reads or renders a document. It receives one boolean per contact ("documents are
//     linked"), from a pull that selects `id, vet_visit_id` and nothing else (Vet Files D14).
//   * It prints no owner note: the report prints no visit note today, and the spec's "as visit
//     notes do today" is that rule.

/** The four channels migration 122's CHECK allows. Anything else is never on the report. */
export type VetChannel = 'in_clinic' | 'phone' | 'text' | 'email'
export type RemoteChannel = Exclude<VetChannel, 'in_clinic'>

const CHANNELS: readonly VetChannel[] = ['in_clinic', 'phone', 'text', 'email']

export function isVetChannel(v: unknown): v is VetChannel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v)
}

/** One `vet_visits` row, ANY channel (the read is `visit-read: anyContact`). */
export interface ReportVetContactInput {
  id: string
  visitedAt: string // DATE 'YYYY-MM-DD'
  channel: VetChannel
  reason: string | null
  clinicName: string | null
  vetName: string | null
  /** At least one live `vet_documents` row links here. The documents themselves never arrive. */
  hasDocuments: boolean
}

/** The minimum of a course this module reads: its id, its name as stored, its start and its link. */
export interface ContactCourseInput {
  id: string
  drugName: string
  startedAt: string
  vetVisitId: string | null
}

export interface VetContactRow {
  id: string
  date: string // 'YYYY-MM-DD'
  channel: VetChannel
  reason: string | null
  clinicName: string | null
  vetName: string | null
  /** The courses this contact started, by start date then name, each name as stored. */
  started: string[]
  hasDocuments: boolean
}

export interface ContactSource {
  date: string
  channel: RemoteChannel
  /** The contact's day sits inside the report's window. */
  inWindow: boolean
  /** Print the contact's day with its year (C-19, by band): it sits outside the window, the window
   *  crosses a year, or the course started in another year than the contact. */
  stampYear: boolean
}

export interface VetContactsBlock {
  rows: VetContactRow[]
  /** Both pulls (the contacts and the document links) reached the end of their result sets. */
  complete: boolean
}

function trimmed(v: string | null): string | null {
  const t = v?.trim() ?? ''
  return t === '' ? null : t
}

/**
 * The section's rows: every contact whose day is inside `[startDate, endDate]`, date order then id
 * (two contacts on one day print in a stable order). The window's first day is included on purpose:
 * on the default scope it IS the last exam, and the vet reads the list from the exam forward.
 */
export function vetContactRowsOf(
  contacts: readonly ReportVetContactInput[],
  courses: readonly ContactCourseInput[],
  scope: { startDate: string; endDate: string },
): VetContactRow[] {
  return contacts
    .filter((c) => c.visitedAt.slice(0, 10) >= scope.startDate && c.visitedAt.slice(0, 10) <= scope.endDate)
    .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id))
    .map((c) => ({
      id: c.id,
      date: c.visitedAt.slice(0, 10),
      channel: c.channel,
      reason: trimmed(c.reason),
      clinicName: trimmed(c.clinicName),
      vetName: trimmed(c.vetName),
      started: courses
        .filter((m) => m.vetVisitId === c.id && contactPrecedesCourse(c.visitedAt, m.startedAt, scope.endDate))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.drugName.localeCompare(b.drugName, 'en') || a.id.localeCompare(b.id))
        .map((m) => m.drugName),
      hasDocuments: c.hasDocuments,
    }))
}

/**
 * "Started after the {day} …" is a claim about ORDER: the contact came first and the course followed.
 * It holds only when the contact's day is on or before the course's start AND on or before the
 * report's last day. A course the owner began on Nov 2 and later linked to a Nov 9 call, or a link
 * to a contact dated after the report, would otherwise read as vet-directed when the record says
 * the opposite (adversarial pass 1 on CUL-2770). Such a link prints nothing, in the source line and
 * in the contact's "Started:" list alike, because the record cannot say the vet started it.
 */
export function contactPrecedesCourse(contactDate: string, courseStartedAt: string, reportEnd: string): boolean {
  const day = contactDate.slice(0, 10)
  return day <= courseStartedAt.slice(0, 10) && day <= reportEnd
}

/**
 * A course's source, when it is a call, texts or an email. Looked up across EVERY contact, not the
 * window's: a course started from a call before the window and still running inside it is the case
 * this line exists for. A course linked to an exam gets nothing (the mock's F1: a visit is the
 * ordinary source and says so nowhere else on the report either), and a link to a row the pull did
 * not return (deleted) gets nothing rather than a guess.
 */
export function courseSourceOf(
  course: { vetVisitId: string | null; startedAt: string },
  contacts: readonly ReportVetContactInput[],
  scope: { startDate: string; endDate: string },
): ContactSource | null {
  if (!course.vetVisitId) return null
  const c = contacts.find((x) => x.id === course.vetVisitId)
  if (!c || c.channel === 'in_clinic') return null
  const date = c.visitedAt.slice(0, 10)
  if (!contactPrecedesCourse(date, course.startedAt, scope.endDate)) return null
  const inWindow = date >= scope.startDate && date <= scope.endDate
  const stampYear =
    !inWindow || scope.startDate.slice(0, 4) !== scope.endDate.slice(0, 4) || date.slice(0, 4) !== course.startedAt.slice(0, 4)
  return { date, channel: c.channel, inWindow, stampYear }
}

/** The channel key the section prints (spec §4.7: Visit | Phone | Text | Email). */
export const CHANNEL_KEY: Record<VetChannel, string> = {
  in_clinic: 'Visit',
  phone: 'Phone',
  text: 'Text',
  email: 'Email',
}

/** The consult noun in "Started after the Nov 9 phone consult". Clinical words: the vet reads it. */
export const CONSULT_NOUN: Record<RemoteChannel, string> = {
  phone: 'phone consult',
  text: 'text consult',
  email: 'email consult',
}

/**
 * What the owner holds, in "{noun} on the owner's phone, not attached." Ruled on the plan (CUL-2770,
 * decision 1): by channel, because the record knows the channel and not what a screenshot shows.
 */
export const DOCUMENTS_NOUN: Record<VetChannel, string> = {
  in_clinic: 'Documents',
  phone: 'Documents',
  text: 'Texts',
  email: 'Email',
}
