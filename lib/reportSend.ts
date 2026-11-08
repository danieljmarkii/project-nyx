// The send sheet's words (Vet report v2 PR-18, CUL-2298; spec §10.3 to §10.5, R-12).
//
// PURE. Everything the send sheet, the email draft and the confirmation SAY is decided here,
// so every sentence can be pinned to its source by a test and the subject can be checked by a
// guard before anything reaches the owner's Mail app.
//
// R-12, THE EMAIL IS A CODE TEMPLATE. Every body sentence is one of three things, and carries
// which in `source`: a FIXED string (slots for the pet's name, the dates and the visit date
// only), a RECORD line (the call card's own words for the live flags, verbatim), or the
// OWNER's text, verbatim, inside quotation marks and labelled ("My note: …"). Code never
// resolves a pronoun, never names a drug, a food or a dose, never rewrites what the owner
// typed. Owner notes and questions never reach a model (R-12; spec §10.4).
//
// THE SUBJECT CARRIES NO NUMBER BUT A DATE (BRK-12, ruling W). The pet with surname, each live
// flag named in words, the window and the visit. No counts, no percentages, no weight. The
// flag nouns are a closed catalogue below, digit-free by construction; `subjectIsClean` is the
// guard, and anything the owner typed into a name that trips it is cut before it can print.
//
// THE CALL ROWS ARE WORDED, NOT DIALLED. No clinic phone, opening hours or emergency vet is
// stored anywhere in the app today, so the rows say who to call and never pretend to know a
// number or that the clinic is closed. d5's after-hours preset (the emergency clinic first)
// keys on the local clock against assumed clinic hours: it only changes which row leads, both
// rows always print, and outside the assumed day the louder row leads.

import { liveCardCopy, composerDate, composerRange, LIVE_FLAG_DAYS, loudestComposerAsk, type ComposerAskLevel, type ComposerFlag, type ComposerLive } from './reportComposer';
import { FLOOR_ASK } from './incidentAskWords';

// ── Targets and the status words (WBC-5) ─────────────────────────────────────────────────────

export type SendTarget = 'email' | 'print' | 'phone' | 'share' | 'copy';

/**
 * What the platform told us. Mail's four results are its own (`MailComposerStatus`); the other
 * targets report only that their call returned (`done`) or threw (`failed`).
 */
export type SendResult = 'sent' | 'saved' | 'cancelled' | 'undetermined' | 'done' | 'failed';

/**
 * The words on the confirmation for one (target, platform, result), or null for no card.
 *
 * Only an iOS Mail `sent` is a fact the app knows, so only it reads as one. Android's Mail
 * intent always comes back `undetermined`, and a share or print sheet never says what the owner
 * did in it, so those are worded as what the app handed over. A cancelled or saved draft is no
 * send at all: no card (WBC-5).
 */
export function sendStatusWords(target: SendTarget, platform: string, result: SendResult): string | null {
  if (result === 'failed' || result === 'cancelled' || result === 'saved') return null;
  switch (target) {
    case 'email':
      return platform === 'ios' && result === 'sent' ? 'Sent from your Mail app' : 'Handed to your Mail app';
    case 'print':
      return 'Sent to print';
    case 'share':
      return 'Shared';
    case 'copy':
      return 'Copied';
    case 'phone':
      // Exam-room mode is a way of showing, not a send: it makes no card.
      return null;
    default:
      return null;
  }
}

/**
 * The target rows, in the mock's order (d1). "Show on this phone" opens exam-room mode (VR2-19,
 * CUL-2299); the sheet lists it only when the screen hands it a way to open it (PM ruling (b),
 * CUL-2298 2026-11-02: whichever of PR-18 and PR-19 merges second wires the call).
 */
export const TARGET_LABEL: Record<SendTarget, string> = {
  email: 'Email to the clinic, from your Mail app',
  print: 'Print',
  phone: 'Show on this phone for the exam room',
  share: 'Share the PDF',
  copy: 'Copy the email text',
};

export const SEND_TARGETS: SendTarget[] = ['email', 'print', 'phone', 'share', 'copy'];

// ── The live flag read (GAP-13) ──────────────────────────────────────────────────────────────

/**
 * The live set when the read failed: nothing was checked, and every surface reads the louder
 * "couldn't check" state, never "none".
 */
export function uncheckedLive(today: string): ComposerLive {
  return { state: 'incomplete', startDate: today, endDate: today, flags: [] };
}

/**
 * The live set the send uses. A fresh read that answered (flags or none) is the truth. A read
 * that failed, or came back incomplete, never downgrades flags this screen already read: "couldn't
 * check" is louder than "none" but quieter than a known flag, and it carries no call rows
 * (adversarial pass on CUL-2298). With nothing better known, the read stays unchecked.
 */
export function liveForSend(fresh: ComposerLive | null, known: ComposerLive | null, today: string): ComposerLive {
  if (fresh && (fresh.state === 'flags' || fresh.state === 'none')) return fresh;
  if (known && known.state === 'flags' && known.flags.length > 0) return known;
  return fresh ?? uncheckedLive(today);
}

/** True only when the 56-day set was read and held no flag: the one case a check may show. */
export function sendIsQuiet(live: ComposerLive): boolean {
  return live.state === 'none';
}

/**
 * CUL-2457: the server's "none" covers only what has reached it. An entry still on this phone
 * (waiting for a connection, or refused by the queue) is outside the read, so the check is
 * withheld until the count after the send's flush says nothing is left. A count that could not
 * be read (`null`) is unknown, and unknown never earns the check. The count is the whole phone's,
 * not one pet's: another pet's unsent row also withholds it, which errs on the louder side.
 */
export function sendRecordAllSent(unsent: { pending: number; quarantined: number } | null): boolean {
  return unsent !== null && unsent.pending === 0 && unsent.quarantined === 0;
}

// ── The call card and its rows (d1, d5) ──────────────────────────────────────────────────────

/**
 * The hours the after-hours preset assumes. No clinic hours are stored, so these are the
 * common day clinic; outside them the emergency clinic leads. Erring this way only reorders
 * two rows that both always print.
 */
export const ASSUMED_CLINIC_OPEN_HOUR = 8;
export const ASSUMED_CLINIC_CLOSE_HOUR = 18;

export interface CallRow {
  id: 'clinic' | 'emergency';
  text: string;
}

export function isAfterHours(localHour: number): boolean {
  return localHour < ASSUMED_CLINIC_OPEN_HOUR || localHour >= ASSUMED_CLINIC_CLOSE_HOUR;
}

/** The rows for the loudest live flag's ask (CUL-2663): the floor's call rows, a deferential
 *  call today (Pattern 11: the clock and the clinic kept, the verb softened, never "an emergency
 *  clinic can see {name} now" over a flag that is not the floor), or one line for a word. */
export function askRowsFor(level: ComposerAskLevel, localHour: number, petName: string): CallRow[] {
  if (level === 'floor') return callRowsFor(localHour, petName);
  if (level === 'word') return [{ id: 'clinic', text: 'Worth a word with your vet about it.' }];
  if (isAfterHours(localHour)) {
    return [
      { id: 'clinic', text: 'Worth a call to your vet when they open.' },
      { id: 'emergency', text: 'An emergency clinic can talk it through now.' },
    ];
  }
  return [
    { id: 'clinic', text: 'Worth a call to your vet today.' },
    { id: 'emergency', text: 'If yours is closed, an emergency clinic can talk it through.' },
  ];
}

/** The floor's call rows, the emergency clinic first after hours (d5). */
export function callRowsFor(localHour: number, petName: string): CallRow[] {
  const name = petName.trim() || 'your pet';
  if (isAfterHours(localHour)) {
    return [
      // "Now", never "tonight": before opening time, tonight reads as leave to wait.
      { id: 'emergency', text: `If your vet is closed, an emergency clinic can see ${name} now.` },
      { id: 'clinic', text: 'Or call your vet when they open.' },
    ];
  }
  return [
    { id: 'clinic', text: FLOOR_ASK.imperative },
    { id: 'emergency', text: 'If they’re closed, call an emergency clinic.' },
  ];
}

export interface SendCallCard {
  title: string;
  body: string;
  /** Empty when the read failed: the card then says it could not check, with no rows to act on. */
  rows: CallRow[];
}

/**
 * The card at the top of the sheet and repeated on a flagged confirmation, or null when the
 * 56-day set held no flag. Its title and body are the composer's own card (one set, one
 * wording); the rows are the sheet's.
 */
export function sendCallCard(live: ComposerLive, petName: string, localHour: number): SendCallCard | null {
  const copy = liveCardCopy(live, petName);
  if (!copy) return null;
  return { ...copy, rows: live.state === 'flags' ? askRowsFor(loudestComposerAsk(live.flags), localHour, petName) : [] };
}

// ── The subject (BRK-12) ─────────────────────────────────────────────────────────────────────

/**
 * Each flag in the composer card's own words, one flag at a time: the subject can never name a
 * flag differently from the card the owner just read. A second catalogue here drifted twice in
 * one day (a refusal trigger and a new `sustained_refusal` fell through to "eating less"), so
 * there is no second catalogue. The card's words are digit-free by construction; the subject
 * guard below checks the result anyway.
 */
function subjectNoun(f: ComposerFlag): string {
  const body = liveCardCopy({ state: 'flags', startDate: '', endDate: '', flags: [f] }, 'x')?.body ?? 'Another finding.';
  return `${body.charAt(0).toLowerCase()}${body.slice(1)}`.replace(/\.$/, '');
}

/** A digit beside a percent sign or a weight unit: the shape the subject must never carry. */
const SUBJECT_FORBIDDEN = /\d+(?:[.,]\d+)?\s*(?:%|percent\b|kgs?\b|kilos?\b|lbs?\b|pounds?\b)/gi;

export function subjectIsClean(subject: string): boolean {
  SUBJECT_FORBIDDEN.lastIndex = 0;
  return !SUBJECT_FORBIDDEN.test(subject);
}

function cleanOwnerPart(raw: string): string {
  return raw.replace(SUBJECT_FORBIDDEN, '').replace(/\s+/g, ' ').trim();
}

export interface SubjectInput {
  petName: string;
  ownerSurname: string | null;
  live: ComposerLive;
  startDate: string;
  endDate: string;
  today: string;
  /** The visit day (YYYY-MM-DD) when the owner keeps it in, else null. */
  visitDay: string | null;
}

export function emailSubject(i: SubjectInput): string {
  const pet = cleanOwnerPart(i.petName) || 'My pet';
  const surname = i.ownerSurname ? cleanOwnerPart(i.ownerSurname) : '';
  const parts = [surname ? `${pet} (${surname})` : pet, 'owner’s home log'];
  if (i.live.state === 'flags' && i.live.flags.length > 0) {
    parts.push(`flags: ${[...new Set(i.live.flags.map(subjectNoun))].join(', ')}`);
  } else if (i.live.state === 'incomplete') {
    parts.push('flags not checked');
  }
  parts.push(composerRange(i.startDate, i.endDate, i.today));
  if (i.visitDay) parts.push(`visit ${composerDate(i.visitDay, i.today)}`);
  const subject = parts.join(' · ');
  // The guard, run on what will actually go out. Every template part is digit-free but the dates
  // and both owner parts were cleaned above, so this never fires today: it is the backstop for a
  // template part someone adds later. Cut, never send.
  return subjectIsClean(subject) ? subject : subject.replace(SUBJECT_FORBIDDEN, '').replace(/\s+/g, ' ');
}

// ── The body (BRK-5) ─────────────────────────────────────────────────────────────────────────

export type EmailSource = 'fixed' | 'record' | 'owner';

export interface EmailSentence {
  id: string;
  source: EmailSource;
  text: string;
}

/** At most five questions travel (R-5a's cap, mirrored by meaning: the owner's questions). */
export const EMAIL_QUESTION_MAX = 5;

export interface EmailBodyInput {
  petName: string;
  live: ComposerLive;
  startDate: string;
  endDate: string;
  today: string;
  visitDay: string | null;
  /** The owner's note, exactly as typed. */
  note: string;
  /** The owner's questions, exactly as typed. Blank ones are dropped; at most five travel. */
  questions: string[];
  /**
   * False for the Copy target: pasted text travels without the PDF, so it must not say
   * "Attached is". Defaults to the email, which always carries the report.
   */
  attached?: boolean;
}

/** The owner's words, untouched but for the whitespace at either end. */
function quoted(raw: string): string {
  return `“${raw.trim()}”`;
}

export function ownerQuestionsOf(questions: string[]): string[] {
  return questions.filter((q) => q.trim() !== '').slice(0, EMAIL_QUESTION_MAX);
}

export function emailBody(i: EmailBodyInput): EmailSentence[] {
  const pet = i.petName.trim() || 'my pet';
  const range = composerRange(i.startDate, i.endDate, i.today);
  const out: EmailSentence[] = [{ id: 'greeting', source: 'fixed', text: 'Hello,' }];
  const forVisit = i.visitDay ? `, for the visit on ${composerDate(i.visitDay, i.today)}` : '';
  out.push(
    i.attached === false
      ? { id: 'covers', source: 'fixed', text: `${pet.charAt(0).toUpperCase()}${pet.slice(1)}’s home log covers ${range}${forVisit}.` }
      : { id: 'attached', source: 'fixed', text: `Attached is ${pet}’s home log for ${range}${forVisit}.` },
  );
  const card = liveCardCopy(i.live, i.petName);
  if (i.live.state === 'flags' && card) {
    // The call card's own record line, verbatim: the same words the owner just read.
    out.push({ id: 'flags', source: 'record', text: `Flags from the last ${LIVE_FLAG_DAYS} days: ${card.body}` });
  } else if (i.live.state === 'incomplete') {
    out.push({ id: 'unchecked', source: 'fixed', text: 'The app couldn’t check the record for flags before I sent this.' });
  }
  if (i.note.trim() !== '') out.push({ id: 'note', source: 'owner', text: `My note: ${quoted(i.note)}` });
  const questions = ownerQuestionsOf(i.questions);
  if (questions.length > 0) {
    out.push({ id: 'questions', source: 'fixed', text: questions.length === 1 ? 'My question:' : 'My questions:' });
    questions.forEach((q, n) => out.push({ id: `question-${n + 1}`, source: 'owner', text: `${n + 1}. ${quoted(q)}` }));
  }
  out.push({ id: 'kept', source: 'fixed', text: 'It was kept in the Culprit app, owner-reported, not a diagnosis.' });
  return out;
}

/** The plain-text body the Mail app receives: one sentence a paragraph, questions as a list. */
export function emailBodyText(sentences: EmailSentence[]): string {
  return sentences
    .map((s, n) => {
      const prev = sentences[n - 1];
      const inList = s.id.startsWith('question-') && prev && (prev.id === 'questions' || prev.id.startsWith('question-'));
      return `${n === 0 ? '' : inList ? '\n' : '\n\n'}${s.text}`;
    })
    .join('');
}

// ── The confirmation (e1, e2) ────────────────────────────────────────────────────────────────

export interface ConfirmationCopy {
  title: string;
  line: string;
}

/** "Nyx’s report" over "Sep 16 to Oct 31 · sent from your Mail app". It names the pet, the
 *  window and how it left; it never says "saved" until saved copies exist (VR2-20). */
export function confirmationCopy(petName: string, startDate: string, endDate: string, today: string, status: string): ConfirmationCopy {
  const name = petName.trim();
  return {
    title: name ? `${name}’s report` : 'Your pet’s report',
    line: `${composerRange(startDate, endDate, today)} · ${status.charAt(0).toLowerCase()}${status.slice(1)}`,
  };
}

// ── Vet documents (GAP-25) ───────────────────────────────────────────────────────────────────

export interface SendDocumentRow {
  id: string;
  title: string;
  kindLabel: string | null;
  dateLabel: string;
  isPdf: boolean;
  pageCount: number;
  /** '' when the bytes live only in the account's storage. */
  localUri: string;
}

export interface SendDocumentChoice {
  id: string;
  title: string;
  detail: string;
  /** The file to attach, or null with `why` saying where to send it from instead. */
  uri: string | null;
  why: string | null;
}

/**
 * The saved vet documents, listed one by one, in the library's order. Each is attachable only
 * when its bytes are on this phone as one file; anything else says where to send it from rather
 * than going half-attached (a multi-page photo document is several files). Never preselected:
 * the sheet starts every one off, invoices included.
 */
export function sendDocumentsOf(rows: SendDocumentRow[]): SendDocumentChoice[] {
  return rows.map((r) => {
    const detail = [r.kindLabel, r.dateLabel].filter((x): x is string => !!x).join(' · ');
    if (r.localUri === '') return { id: r.id, title: r.title, detail, uri: null, why: 'Not on this phone. Send it from Vet Files.' };
    if (!r.isPdf && r.pageCount > 1) return { id: r.id, title: r.title, detail, uri: null, why: 'Several pages. Send it from Vet Files.' };
    return { id: r.id, title: r.title, detail, uri: r.localUri, why: null };
  });
}
