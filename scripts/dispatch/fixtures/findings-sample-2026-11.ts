// The PR-15 replay sample (CUL-2876, ruled "go a" by the PM on 2026-11-23). The retro's own
// 60 (docs/workflow-retro-2026-11.md) were never written down, so this is a fresh 60 from the
// same window, recorded so any later session can re-run it.
//
// HOW IT WAS DRAWN. Every Culprit issue created 2026-10-22 to 2026-11-21 (802). A finding is
// one in a "Found along the way" milestone, labelled `Live harm`, or whose description names
// a reviewer pass or a cold read; run-order rows ("PR-…"), discoveries, rulings and class
// roll-ups are not (473). Sorted by number, every (473/60)th one: no hand picking.
//
// HOW IT WAS SCORED, on the retro's rubric, by one session reading each issue in full:
//   worth  real and worth fixing before an owner or a vet meets the surface
//   low    real, but rare to trigger, polish, a guard on a hypothetical, or already harmless
//   other  not a defect: a cleanup note, a process idea, a future decision, a gate memo
// Direction is the tag the filer wrote (`undefined` where none was written). Origin, devices,
// timing and precondition are read from the issue's own Why: what the reviewer would have
// put in the new field line. A judgement call is noted on its row.
//
// The retro predicted, on its sample: 20 to 24 of 29 low value rerouted (69% to 83%), none of
// 25 worth fixing, no QUIET one. replay.test.ts holds this sample to those shares.

import type { ProposedFinding } from '../precheck.ts';

export type Score = 'worth' | 'low' | 'other';
export type SampleRow = { id: string; score: Score; f: ProposedFinding; note?: string };

const row = (id: string, score: Score, f: Partial<ProposedFinding> & Pick<ProposedFinding, 'title' | 'surface'>, note?: string): SampleRow => ({
  id,
  score,
  note,
  f: { origin: 'diff', devices: 1, timing: 'any', precondition: 'none', category: 'adversarial-reviewer', ...f },
});

const HARM = ['Live harm'];

export const SAMPLE: SampleRow[] = [
  row('CUL-2091', 'other', { title: "Sync: retire meal_components' double upload once migration 107 is applied", direction: 'neither', surface: 'sync', category: 'build:cleanup' }),
  row('CUL-2098', 'worth', { title: "Moving a warned meal's time to before the trial leaves its food's trial heads-up used up", direction: 'QUIET', surface: 'trial' }),
  row('CUL-2106', 'worth', { title: "A fresh log's trial heads-up is lost when a newer log replaces its card before it shows", direction: 'QUIET', labels: HARM, surface: 'trial' }),
  row('CUL-2114', 'low', { title: "anon keeps the platform's default grants on events, pets, vet_visits and the other public tables", direction: 'neither', origin: 'main', surface: 'privacy guards', category: 'rls-privacy-reviewer:guard' }),
  row('CUL-2122', 'worth', { title: 'Mixed meals: a bowl read as last recorded is still only half-used by the intake, treat and detection readers', direction: 'QUIET', timing: 'race', surface: 'intake', items: [{ text: 'all-treat bowl hides a refusal', direction: 'QUIET' }, { text: 'treat missing from the report list', direction: 'QUIET' }] }, 'a sync race, so rare, but QUIET: never rerouted'),
  row('CUL-2131', 'low', { title: 'Vet report: "of a 56-day window" reads as the report window when the two lengths match', direction: 'neither', origin: 'main', surface: 'vet report', category: 'vet-report-cold-read' }),
  row('CUL-2147', 'low', { title: 'VomitAnalysisSection suite: a stored fold seeded with setObservationFold may never be read back', direction: 'neither', origin: 'main', surface: 'tests', category: 'build:test' }),
  row('CUL-2157', 'low', { title: "The undivided timing lane on a trial past 84 days counts nothing from the trial's earlier days", direction: 'neither', origin: 'main', surface: 'Signal' }),
  row('CUL-2172', 'low', { title: 'Label photos are orphaned in storage when the owner abandons a capture', direction: 'neither', origin: 'main', surface: 'storage', category: 'build:retention' }),
  row('CUL-2182', 'low', { title: 'The folded findings strip: "Unclear" also loses what it is about', direction: 'neither', origin: 'main', surface: 'incident', category: 'build:polish' }),
  row('CUL-2192', 'low', { title: 'Current medications card: a teal "finished" button and row actions whose tap areas overlap', direction: 'neither', origin: 'main', surface: 'Pet tab', category: 'code-reviewer' }),
  row('CUL-2217', 'low', { title: 'The symptom save: a black "Log it" pill now sits inside the indigo save', direction: 'neither', surface: 'log', category: 'build:polish' }, 'caused by its own row, so it files'),
  row('CUL-2274', 'worth', { title: 'The vet report says "The owner was told" about a weight finding Home cannot show', labels: [...HARM, 'Area: Correctness', 'Bug'], surface: 'vet report' }),
  row('CUL-2315', 'worth', { title: 'Vet report: run the intake and look checks to the report date when a hand-picked window ends early', direction: 'LOUD', surface: 'vet report' }, 'tagged LOUD, so not shielded; it files because it is caused by its PR and needs no rare trigger'),
  row('CUL-2323', 'worth', { title: 'Vet report v2 sheet 1: a window with no symptom entries reads calm even when Noticed concerns and unfinished meals are building', labels: [...HARM, 'Gate: clinical'], surface: 'vet report' }),
  row('CUL-2331', 'worth', { title: "The AI summary must keep the privacy policy's promises before its flag turns on", labels: [...HARM, 'Gate: privacy'], surface: 'vet report', category: 'rls-privacy-reviewer' }),
  row('CUL-2340', 'worth', { title: 'Vet report v2: does the "Changes in this window" line print on a sheet that also has a symptom entry?', labels: [...HARM, 'Gate: clinical'], surface: 'vet report' }),
  row('CUL-2351', 'worth', { title: 'Vet report v2 sheet 1: no line names what the pet ate after a trial ended, and no gap line for meals barely logged', direction: 'QUIET', labels: ['Gate: clinical'], surface: 'vet report', category: 'vet-report-cold-read' }),
  row('CUL-2361', 'worth', { title: 'Vet report v2 sheet 1: on a zero-sign sheet the serif sentence is "No symptom events were logged"', labels: [...HARM, 'Gate: clinical'], surface: 'vet report', category: 'vet-report-cold-read' }),
  row('CUL-2369', 'low', { title: 'Vet report: the getting-worse check\'s "logged days" count a narrower set than the page\'s logged days', direction: 'LOUD', origin: 'main', surface: 'vet report' }),
  row('CUL-2378', 'other', { title: 'Vet report v2 phone guard: run scripts/report-phone/guard.mjs in CI', direction: 'neither', surface: 'CI', category: 'build:process', cites: [{ file: 'scripts/report-phone/guard.mjs', snippet: '' }] }),
  row('CUL-2389', 'low', { title: 'Guard for migration 116: indirect routes to deleting a pet are not read', direction: 'neither', precondition: 'abnormal', surface: 'privacy guards', category: 'rls-privacy-reviewer:guard' }, 'needs a future, disguised migration'),
  row('CUL-2399', 'low', { title: 'Delete account: a "try again" refusal says "check your connection" and retries too soon', direction: 'LOUD', precondition: 'abnormal', surface: 'account', category: 'rls-privacy-reviewer' }, 'needs the server mid-restart'),
  row('CUL-2409', 'low', { title: 'Vet report v2 preview: two loose ends from adversarial pass 1', direction: 'LOUD', surface: 'vet report', items: [{ text: 'a long pinned warning takes 57% of a small screen', direction: 'LOUD' }, { text: "the wait's flag slot reads 56 days", direction: 'neither' }] }),
  row('CUL-2418', 'low', { title: 'Get ready: an unknown intake trigger ranks as undefined, not the -1 its comment promises', direction: 'neither', precondition: 'abnormal', surface: 'Get ready' }, 'needs an app build older than the server card'),
  row('CUL-2426', 'low', { title: 'The storage write-policy guard can be beaten by a deliberately obfuscated later migration', direction: 'neither', precondition: 'abnormal', surface: 'privacy guards', category: 'rls-privacy-reviewer:guard' }),
  row('CUL-2433', 'low', { title: 'Phone report guard: check paint, not only layout, and run it in CI', direction: 'neither', surface: 'CI', category: 'adversarial-reviewer:guard', cites: [{ file: 'scripts/report-phone/guard.mjs', snippet: '' }] }, 'the CI half duplicates CUL-2378'),
  row('CUL-2442', 'worth', { title: 'Vet report event log: a row with no photo prints "—" in the photo-findings column', direction: 'QUIET', labels: HARM, surface: 'vet report', category: 'vet-report-cold-read' }),
  row('CUL-2452', 'other', { title: 'Vet report v2: saved copies, two later decisions', direction: 'neither', precondition: 'abnormal', surface: 'vet report', category: 'rls-privacy-reviewer' }),
  row('CUL-2465', 'worth', { title: 'Vet report draft reaper: a stopped or stalled sweep is seen by no one', labels: [...HARM, 'Gate: privacy'], surface: 'storage', category: 'rls-privacy-reviewer' }),
  row('CUL-2473', 'worth', { title: 'Report WebViews: navigations that still skip the load check', labels: HARM, harm: 'exposure', surface: 'vet report', category: 'rls-privacy-reviewer' }),
  row('CUL-2483', 'low', { title: 'Vet report: trial and medication polish from the CUL-2440 cold read', direction: 'neither', origin: 'main', surface: 'vet report', category: 'vet-report-cold-read', items: [{ text: 'two halving schemes', direction: 'neither' }, { text: "Motozol's route", direction: 'neither' }, { text: 'sheet 1 spills to a page 2', direction: 'neither' }] }),
  row('CUL-2493', 'low', { title: 'Vet report: cold-read polish on the trial pages', direction: 'LOUD', origin: 'main', surface: 'vet report', category: 'vet-report-cold-read', items: [{ text: 'refusal wording over 2 of 4', direction: 'LOUD' }, { text: 'untraceable denominator', direction: 'neither' }, { text: '"this copy"', direction: 'neither' }, { text: 'collapsed treat dates', direction: 'neither' }, { text: 'post-trial vomits counted', direction: 'neither' }, { text: 'demo meals at 03:00', direction: 'neither' }] }, 'same class as CUL-2483 (cold-read polish on the trial pages), so its items join that issue'),
  row('CUL-2501', 'worth', { title: 'Android: can the vet document viewer drop a PDF into public Downloads?', direction: 'QUIET', labels: HARM, harm: 'exposure', surface: 'vet files', category: 'rls-privacy-reviewer' }),
  row('CUL-2510', 'worth', { title: 'Vet report: the chronicity flag says "44 days is a floor" while the trial block counts the same signs 52 days earlier', labels: HARM, surface: 'vet report', category: 'vet-report-cold-read' }),
  row('CUL-2519', 'low', { title: 'Vet report drafts: the overdue check cannot see a stored report file left behind with no draft row', direction: 'QUIET', precondition: 'abnormal', surface: 'storage', category: 'rls-privacy-reviewer' }, 'low value (no code path makes the orphan) but tagged QUIET, so it files'),
  row('CUL-2528', 'low', { title: 'Vet report: a pill paired to a merged duplicate of the trial diet reads as given in an unidentified food', direction: 'LOUD', surface: 'vet report', items: [{ text: 'deduped vehicle', direction: 'LOUD' }, { text: 'adherence in appendix B', direction: 'LOUD' }] }),
  row('CUL-2547', 'worth', { title: 'SyncBanner only re-checks the age of unsent entries when it re-renders', direction: 'QUIET', labels: HARM, surface: 'sync' }),
  row('CUL-2557', 'low', { title: 'Vet report v2 AI lead: an ended trial can be written as if it were still running', direction: 'LOUD', origin: 'main', surface: 'vet report' }, 'the AI lead is off for everyone and the trial line prints the end date; its Why says it is already on main'),
  row('CUL-2567', 'low', { title: 'Vet report v2 sheet-1 must-carry guard: harden its matching', direction: 'neither', precondition: 'abnormal', surface: 'vet report', category: 'adversarial-reviewer:guard' }),
  row('CUL-2575', 'worth', { title: 'Saved vet reports: a flag switch, a new consent wording or a failed read refuses a printed-summary copy for good', labels: [...HARM, 'Gate: privacy'], harm: 'loss', surface: 'vet report', category: 'rls-privacy-reviewer' }),
  row('CUL-2584', 'low', { title: 'Orphan sweep check: a 2-hour public window lets anyone run a full read pass or trip a false alarm', direction: 'neither', precondition: 'abnormal', surface: 'storage', category: 'rls-privacy-reviewer' }, 'needs a hostile caller with the public key'),
  row('CUL-2593', 'worth', { title: 'A cat that refused every meal it was rated on today is asked to call the vet only "if it carries on"', labels: HARM, surface: 'Signal' }),
  row('CUL-2600', 'low', { title: 'Get ready places a stale phone intake row by trigger alone', direction: 'neither', precondition: 'abnormal', surface: 'Get ready' }, 'needs a stale or missing Signal cache'),
  row('CUL-2608', 'worth', { title: 'Vet report: times for an owner who never set a time zone print as New York time, with no label', direction: 'QUIET', labels: HARM, surface: 'vet report' }),
  row('CUL-2618', 'low', { title: 'Vet report v2 AI lead: "Weigh the patient" counts as a live flag, so one real flag plus it drops the summary', direction: 'LOUD', surface: 'vet report' }),
  row('CUL-2640', 'other', { title: "Vet report v2 AI lead: the bake-off harness's one-time checker re-run is not in the pre-registered rule", direction: 'neither', origin: 'main', surface: 'bake-off', category: 'build:process' }),
  row('CUL-2648', 'low', { title: 'Vet report v2 sheet 1: on an R-11 record, the grey "Ran and did not trigger" line prints above the flagged lead chart', origin: 'main', surface: 'vet report', category: 'vet-report-cold-read' }, 'filed with no Direction line, so it counts as QUIET and files'),
  row('CUL-2677', 'low', { title: 'Vet report\'s burden row says "the owner was told" for a past window the owner may never have seen', direction: 'neither', origin: 'main', surface: 'vet report' }, 'judgement call: past hand-picked windows only; CUL-2274, its live sibling, is worth'),
  row('CUL-2686', 'worth', { title: 'A cat with no meal logged in 24 h reads quiet on the EN-5 account but floor everywhere else', labels: [...HARM, 'Gate: clinical', 'Waiting on PM'], surface: 'Signal' }),
  row('CUL-2694', 'other', { title: "The diet trial card's softer cat line needs a clock re-check before it can turn on", direction: 'LOUD', origin: 'main', surface: 'trial' }, 'a gate memo on a line that stays off'),
  row('CUL-2706', 'low', { title: 'A carried Signal card\'s "An earlier read, on <day>" names the UTC day, not the owner\'s', direction: 'neither', origin: 'main', surface: 'Signal' }),
  row('CUL-2714', 'worth', { title: "Vet report: beside a refused trial, page 1's headline and tile still count the refused bowls as feedings of the diet", labels: [...HARM, 'Bug'], surface: 'vet report' }),
  row('CUL-2752', 'other', { title: 'Vet visit reminders: what the product read left for later', origin: 'main', surface: 'vet visits', category: 'pm-feature-review', items: [{ text: 'account-wide switch' }, { text: 'edit moves reminders silently' }, { text: '"The morning of"' }, { text: '"Get ready" as a proper noun' }, { text: 'mixed-day title' }, { text: 'declined OS prompt' }, { text: 'two kinds on one day' }] }, "a bundle with no tags at all: CUL-2406's shape, so it files"),
  row('CUL-2793', 'worth', { title: 'A recheck booking the old wheel made up still counts as a booked visit outside the recheck row', labels: [...HARM, 'Waiting on PM'], surface: 'Home' }),
  row('CUL-2801', 'low', { title: 'Older app builds extend a trial window without re-stamping when it moved or who asked', labels: HARM, precondition: 'abnormal', surface: 'vet report' }, 'needs a phone on a July to September build; the filer labelled it Live harm, which shields it'),
  row('CUL-2810', 'worth', { title: 'Vet report headline: off-diet feedings of an unread food print "with no off-trial protein recorded"', labels: [...HARM, 'Gate: clinical'], surface: 'vet report' }),
  row('CUL-2831', 'low', { title: 'Vet contacts: the visit-readers guard can be fooled three ways', direction: 'neither', precondition: 'abnormal', surface: 'vet contacts', category: 'adversarial-reviewer:guard' }),
  row('CUL-2842', 'worth', { title: "Vet contacts: correcting a visit does not rebuild Home's warnings, so a stale \"with your vet\" can stay up to a day", labels: [...HARM, 'Gate: clinical'], surface: 'Home' }),
  row('CUL-2850', 'low', { title: 'Vet contacts: the words around a call still say "visit"', direction: 'neither', origin: 'main', surface: 'vet contacts', category: 'pm-feature-review' }),
];
