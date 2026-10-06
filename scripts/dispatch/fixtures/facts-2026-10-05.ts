// The facts of 2026-10-05, read back on 2026-10-06 from GitHub, Linear and the two
// projects' `/dispatch run` updates (CUL-1615's fixtures). Every number, title, branch,
// session id and time below was read, not composed; where a fact had to be reconstructed
// the line says how.
//
// The pages: `out-of-beta.2026-10-05.page.md` is Out of beta's description as saved at
// 2026-10-05T12:33Z (unchanged since). `engines-v3.2026-10-05.page.md` is Engines v3's as
// of 2026-10-06T01:13Z with one line removed: row 23d, added at 2026-10-06T00:06Z, after
// the 21:10Z read this fixture replays. Nothing else on that page moved a row's verdict.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ClaimFact, IssueFact, Launch, PrFact, ProjectInput, SessionBucket } from '../plan.ts';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

export const ENGINES_V3: ProjectInput = {
  name: 'Engines v3: the accountable engine',
  description: read('engines-v3.2026-10-05.page.md'),
};
export const OUT_OF_BETA: ProjectInput = {
  name: 'Out of beta — Noticed, Design v2, History v2, the trial screen',
  description: read('out-of-beta.2026-10-05.page.md'),
};

const OOB = 'Out of beta — Noticed, Design v2, History v2, the trial screen';
const OOB_BRANCH = 'claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen';
const m = (number: number, title: string, headRef: string, createdAt: string, mergedAt: string): PrFact => ({
  number,
  title,
  state: 'merged',
  headRef,
  createdAt,
  mergedAt,
});

// Merged PRs that a row on either page names (merge times from GitHub). Head refs for the
// pre-09-29 Engines v3 PRs were read through the search API, which omits them: they are
// left empty, and those rows match by their `PR-NN` titles or their page's ✓ title.
export const MERGED: PrFact[] = [
  m(936, 'Speak a read verdict or status this build does not know safely, on phone and server (CUL-1277)', '', '2026-09-26T21:10:23Z', '2026-09-26T22:56:24Z'),
  m(938, 'Completion cards and the incident record speak to VoiceOver (CUL-1275)', '', '2026-09-26T21:13:05Z', '2026-09-27T15:18:37Z'),
  m(939, 'A read can only sit on an incident of its own pet: migration 074 + the analyze-* write-back (CUL-1203)', '', '2026-09-26T21:15:21Z', '2026-09-26T22:36:06Z'),
  m(940, 'Per-incident read: a failed run keeps its escalation, a re-read never lowers one, a stored red flag carries (CUL-815, CUL-532, CUL-817)', '', '2026-09-26T21:17:38Z', '2026-09-27T12:22:21Z'),
  m(934, 'analyze-vomit: derive visual flags from the structured fields, like analyze-stool (CUL-534)', '', '2026-09-26T21:00:15Z', '2026-09-26T21:17:34Z'),
  m(937, 'Vet report: count every logged meal and state the rated subset beside it (CUL-1274)', '', '2026-09-26T21:12:34Z', '2026-09-26T23:41:05Z'),
  m(933, 'Quick Win sweep: the Pet tab visits gate pinned, a faster protein test, doc drift, an engine replay that refuses an empty export (CUL-1097, CUL-1156, CUL-1103, CUL-1276)', '', '2026-09-26T17:39:18Z', '2026-09-26T20:08:25Z'),
  m(935, 'The engine replay reads only evaluation subjects: the PM\'s pets, listed, and the export query pinned (CUL-1314)', '', '2026-09-26T21:05:34Z', '2026-09-26T22:39:45Z'),
  m(944, 'Engines v3 PR-06: a firm vet ask holds until the count falls; the fold stops re-opening with false reasons (CUL-1272, CUL-1273)', '', '2026-09-26T21:25:42Z', '2026-09-27T09:26:27Z'),
  m(963, 'Engines v3 PR-10: the stamps (migration 075): which model, prompt, rules, photos and flags made each read and Signal, plus a log of what the Signal showed', '', '2026-09-27T17:16:49Z', '2026-09-27T22:31:02Z'),
  m(964, 'Engines v3 PR-14: a refusal can only withdraw evidence for the refused food (CUL-1190)', '', '2026-09-28T13:22:39Z', '2026-09-28T15:10:31Z'),
  m(965, 'Engines v3 PR-11a: the fail-closed flag read, the pure vomit context builder, the one stamp writer (CUL-1267)', '', '2026-09-28T13:44:55Z', '2026-09-28T14:33:11Z'),
  m(966, 'Engines v3 PR-20: care state + outcome loop spec, mock round 3 (CUL-1139, CUL-1144)', '', '2026-09-28T18:36:57Z', '2026-09-28T19:25:37Z'),
  m(967, 'Engines v3 PR-24: the per-incident read in tiers, mock round 1 + spec (EN-3, EN-4 discovery)', '', '2026-09-28T18:37:45Z', '2026-09-28T19:41:37Z'),
  m(968, 'Engines v3 PR-18a: the weight lane\'s spec and frames (EN-8, CUL-1135)', '', '2026-09-28T18:40:26Z', '2026-09-28T19:12:15Z'),
  m(969, 'Engines v3 PR-12: History v2\'s read copy gains the three read stamps (CUL-1267)', '', '2026-09-28T19:15:17Z', '2026-09-28T22:24:33Z'),
  m(970, 'Engines v3 PR-14b: the intake-decline detectors exclude a free-fed bowl\'s ratings by instant, on the phone and the server (CUL-1086)', '', '2026-09-28T19:19:07Z', '2026-09-28T23:00:28Z'),
  m(971, 'Engines v3 PR-11b: the pure Signal pipeline, extracted from generate-signal (CUL-1267)', '', '2026-09-28T19:27:58Z', '2026-09-28T20:19:30Z'),
  m(972, 'Engines v3 PR-15: the synthetic corpus of pets with known truth (CUL-508)', '', '2026-09-28T19:49:48Z', '2026-09-28T22:40:29Z'),
  m(975, 'Engines v3 PR-09: generate-signal and ask page every pull newest-first, and an incomplete read never reassures (CUL-989)', '', '2026-09-28T23:56:33Z', '2026-09-29T12:06:11Z'),
  m(977, 'Engines v3 PR-25: the per-incident read\'s tier column, schema only (CUL-1133)', '', '2026-09-29T12:25:20Z', '2026-09-29T12:54:14Z'),
  m(978, 'Engines v3 PR-14c: no calm "down" card while a sign\'s weekly count is at the burden threshold', '', '2026-09-29T12:33:00Z', '2026-09-29T13:15:20Z'),
  m(979, 'Engines v3 PR-13a: the vomit read states the record, anchored to the vomit, no warning lost (CUL-1130)', '', '2026-09-29T12:37:56Z', '2026-09-29T13:43:13Z'),
  m(980, 'Engines v3 PR-26: the tier dual-written beside the verdict; the stool spill-over fixed (CUL-1133, CUL-1138)', '', '2026-09-29T15:05:47Z', '2026-09-29T16:21:02Z'),
  m(982, 'Engines v3 PR-21a: signal_shown_log is written by the server only, migration 080 (CUL-1384)', 'claude/cul-1384-pr21a-0929', '2026-09-29T20:15:04Z', '2026-09-29T20:47:10Z'),
  m(983, 'Engines v3 PR-22a: the Signal and Ask dose reads name their FK, fail loudly, and are guarded (CUL-1099)', 'claude/cul-1099-pr22a-0929', '2026-09-29T20:17:26Z', '2026-09-29T21:00:47Z'),
  m(984, 'Engines v3 PR-14d: the burden card, a safety card that needs no earlier week (CUL-1410)', 'claude/cul-1410-pr14d-0929', '2026-09-29T21:03:17Z', '2026-09-29T21:52:14Z'),
  m(985, 'Engines v3 PR-27a: a re-run over a live call keeps the escalation on screen', 'claude/cul-827-pr27a-0929', '2026-09-29T22:13:19Z', '2026-09-29T22:48:46Z'),
  m(986, 'Engines v3 PR-18: each weight reading\'s source (migration 081)', 'claude/cul-1412-pr18-0929', '2026-09-29T22:22:35Z', '2026-09-29T22:46:48Z'),
  m(987, 'Engines v3 PR-22: EN-10 server, counts-only context lines behind engines_v3_en10 (CUL-1420)', 'claude/cul-1420-pr22-0929', '2026-09-29T22:32:33Z', '2026-09-29T23:04:12Z'),
  m(988, 'Engines v3 PR-21: the care record, migration 082 (CUL-1415, CUL-1416)', 'claude/cul-1415-pr21-0929', '2026-09-30T00:08:54Z', '2026-09-30T01:03:23Z'),
  m(989, 'Engines v3 PR-27: EN-3 client, one tier-word map feeding every surface', 'claude/cul-1133-pr27-0929', '2026-09-30T00:17:22Z', '2026-09-30T01:29:03Z'),
  m(990, 'Engines v3 PR-14e: the long band says when its vomits followed a refused bowl (provisional)', 'claude/cul-1195-pr14e-0929', '2026-09-30T00:23:22Z', '2026-09-30T00:37:24Z'),
  m(991, 'Engines v3 PR-38: EN-10 client, the context lines on the Signal screen and in Get ready', 'claude/cul-1421-pr38-0930', '2026-09-30T12:50:17Z', '2026-09-30T15:46:05Z'),
  m(992, 'Engines v3 PR-28: EN-4\'s floor on the vomit read, the floor-only mode and the 24 h re-run (CUL-1435)', 'claude/cul-1134-pr28-0930', '2026-09-30T12:50:17Z', '2026-09-30T15:54:40Z'),
  m(993, 'Engines v3 PR-16: EN-1, the engine scorecard, with pass lines fixed per wave (CUL-1131)', 'claude/cul-1131-pr16-0930', '2026-09-30T13:09:49Z', '2026-09-30T23:45:46Z'),
  m(1002, 'Engines v3 PR-32: EN-11 built dark (Early food tier retired, a worsening card floor, a reversed-in-time control)', 'claude/cul-1141-pr32-1002', '2026-10-02T17:43:51Z', '2026-10-02T18:14:41Z'),
  m(1014, 'Engines v3 PR-19: the weight lane in detection.ts, behind engines_v3_en8 (CUL-1413)', 'claude/engines-v3-pr19-10031415', '2026-10-03T14:38:01Z', '2026-10-03T16:40:30Z'),
  m(1016, 'Engines v3 PR-23: EN-9\'s care state on the live safety finding, built dark', 'claude/engines-v3-pr23-10031415', '2026-10-03T15:04:45Z', '2026-10-03T15:39:50Z'),
  m(1020, 'Engines v3 PR-35: EN-9\'s answers on the finding screen, at the vet and after it', 'claude/engines-v3-pr35-10031547', '2026-10-03T15:59:45Z', '2026-10-03T17:15:09Z'),
  m(1071, 'Engines v3 PR-34: the vet-keyed eight-week question, built off and measured on a two-sided test (CUL-1290)', 'claude/engines-v3-pr34-10051618', '2026-10-05T17:01:50Z', '2026-10-05T17:27:14Z'),
  m(1073, 'Engines v3 PR-23b: the raised-again latch releases on what an answer is about, not when it was written (CUL-1545)', 'claude/engines-v3-pr23b-10051806', '2026-10-05T18:26:39Z', '2026-10-05T18:38:15Z'),
  // Out of beta.
  m(1017, `${OOB} PR-20: each Signal finding gets its own identity (CUL-1213)`, `${OOB_BRANCH}-pr20-10031453`, '2026-10-03T15:13:03Z', '2026-10-03T15:34:39Z'),
  m(1018, `${OOB} PR-10: the meal card stops celebrating a refusal (CUL-894)`, `${OOB_BRANCH}-pr10-10031453`, '2026-10-03T15:13:52Z', '2026-10-03T15:40:20Z'),
  m(1015, `${OOB} PR-40: an ended trial card keeps the call ask while the diet refusal is live`, `${OOB_BRANCH}-pr40-10031453`, '2026-10-03T15:03:22Z', '2026-10-03T15:19:39Z'),
  m(1019, `${OOB} PR-30: every vomit day is rose on the strip and the month`, `${OOB_BRANCH}-pr30-10031453`, '2026-10-03T15:17:44Z', '2026-10-03T15:37:23Z'),
  m(1021, `${OOB} PR-17: sign-out clears the account's state from memory`, `${OOB_BRANCH}-pr17-10031617`, '2026-10-03T16:28:06Z', '2026-10-03T16:54:28Z'),
  m(1022, `${OOB} PR-12: under any safety card the look's coverage footer is withheld and the owner's words stay (CUL-909)`, `${OOB_BRANCH}-pr12-10031617`, '2026-10-03T16:28:51Z', '2026-10-03T17:09:32Z'),
  m(1023, `${OOB} PR-36: Meal stops calling treats meals; a look-only day stops reading "nothing logged" (CUL-1243, CUL-1244)`, `${OOB_BRANCH}-pr36-10031617`, '2026-10-03T16:41:33Z', '2026-10-03T16:57:35Z'),
  m(1025, `${OOB} PR-11: a hidden Noticed notes switch sends includeNotes false (CUL-1464)`, `${OOB_BRANCH}-pr11-10031924`, '2026-10-03T19:37:25Z', '2026-10-03T19:49:54Z'),
  m(1026, `${OOB} PR-13: the emergency door says "Call your vet today" on an intake decline (CUL-1372)`, `${OOB_BRANCH}-pr13-10031924`, '2026-10-03T19:44:21Z', '2026-10-03T19:54:16Z'),
  m(1027, `${OOB} PR-21: the device pass made runnable (fixture account, forced cold start, a safe Noticed seed) (CUL-1222)`, `${OOB_BRANCH}-pr21-10031924`, '2026-10-03T19:48:26Z', '2026-10-03T20:04:15Z'),
  m(1028, `${OOB} PR-23: the look's refusal door leads the compact set (CUL-1501)`, `${OOB_BRANCH}-pr23-10032034`, '2026-10-03T20:45:14Z', '2026-10-03T20:58:22Z'),
  m(1029, `${OOB} PR-18: the looks same-pet guard stops leaking a date through its error code (migration 083)`, `${OOB_BRANCH}-pr18-10032034`, '2026-10-03T20:55:59Z', '2026-10-03T21:30:29Z'),
  m(1030, `${OOB} PR-37: History names unconfirmed doses (CUL-1549)`, `${OOB_BRANCH}-pr37-10032034`, '2026-10-03T20:59:10Z', '2026-10-03T21:28:28Z'),
  m(1031, `${OOB} PR-22: the waits to the silhouette primitive, one tick implementation`, `${OOB_BRANCH}-pr22-10032108`, '2026-10-03T21:29:11Z', '2026-10-03T21:43:14Z'),
  m(1032, `${OOB} PR-31: a refused meal keeps counting after its food goes free-choice`, `${OOB_BRANCH}-pr31-10032209`, '2026-10-03T22:32:17Z', '2026-10-03T22:50:51Z'),
  m(1033, `${OOB} PR-26: the Signal screen re-reads, refreshes on edits and opens offline (CUL-1219)`, `${OOB_BRANCH}-pr26-10032209`, '2026-10-03T22:48:17Z', '2026-10-03T23:00:45Z'),
  m(1034, `${OOB} PR-38: HV-9 calls 1a to 4a — sheet captions, the pet name opens Your pets, Meal's meals not finished, search inside a filter`, `${OOB_BRANCH}-pr38-10032209`, '2026-10-03T23:58:33Z', '2026-10-04T00:29:10Z'),
  m(1035, `${OOB} PR-41: the free-fed watch line, What {pet} can eat on overrun, the refusal-face wording (CUL-1339)`, `${OOB_BRANCH}-pr41-10032342`, '2026-10-04T00:02:47Z', '2026-10-04T00:19:28Z'),
  m(1036, `${OOB} PR-42: the Pet tab's trial card shows a retry when its read fails (CUL-1458)`, `${OOB_BRANCH}-pr42-10040041`, '2026-10-04T00:52:49Z', '2026-10-04T01:08:26Z'),
  m(1037, `${OOB} PR-24: Patterns' trial sign, a counted refusal, an honest weight line, and no "no vomiting" on a dose-only day`, `${OOB_BRANCH}-pr24-10032342`, '2026-10-04T00:53:50Z', '2026-10-04T01:58:57Z'),
  m(1038, `${OOB} PR-43: the unfinished-bowl withhold reads the wide meal record (CUL-1348)`, `${OOB_BRANCH}-pr43-10040041`, '2026-10-04T01:01:21Z', '2026-10-04T01:17:44Z'),
  m(1039, 'Vet report: "Doses given (incl. partial)", "Given on N of M days", and one split of a course\'s days (CUL-1550)', 'claude/optimistic-maxwell-ysdfgn', '2026-10-04T01:14:32Z', '2026-10-04T13:06:33Z'),
  m(1040, 'Trial outcome sheet: name the daily looks instead of claiming no symptoms (CUL-1483)', 'claude/zealous-johnson-yokujg', '2026-10-04T01:14:51Z', '2026-10-04T01:45:56Z'),
  m(1041, 'Noticed: hold the Patterns pairing out of v1 (CUL-914)', 'claude/pensive-cerf-i8wfo0', '2026-10-04T01:15:35Z', '2026-10-04T02:06:36Z'),
  m(1042, 'Timing lane: a same-instant seen + found vomit opens on the found one, everywhere (CUL-1230)', 'claude/hopeful-hawking-xpkohd', '2026-10-04T01:22:43Z', '2026-10-04T01:51:12Z'),
  m(1043, 'Daily look: the widget and Ask stop saying "nothing logged" beside a look (CUL-1475)', 'claude/clever-meitner-hjddww', '2026-10-04T02:10:10Z', '2026-10-04T13:18:26Z'),
  m(1044, `${OOB} PR-25: Design v2's accessibility floor, the ready half`, `${OOB_BRANCH}-pr25-10040201`, '2026-10-04T02:27:47Z', '2026-10-04T02:40:02Z'),
  m(1045, 'Trial card, day 1: "No meals logged yet today." (CUL-1564)', 'claude/loving-hamilton-gdrqxy', '2026-10-04T13:36:31Z', '2026-10-04T13:49:03Z'),
  m(1046, 'Patterns month opens on the symptom with the most days in the whole read (CUL-1565)', 'claude/trusting-curie-vaqp6z', '2026-10-04T13:42:26Z', '2026-10-04T14:05:27Z'),
  m(1047, `${OOB} PR-32: a calm photo read draws no word; an unclear read says its record's words`, `${OOB_BRANCH}-pr32-10041322`, '2026-10-04T13:46:35Z', '2026-10-04T14:03:49Z'),
  m(1048, 'Trial card: a free-fed trial past its window keeps the bowl\'s wording, not "Meals logged on N of N days" (CUL-1554)', 'claude/gifted-mayer-885mac', '2026-10-04T13:56:12Z', '2026-10-04T14:13:00Z'),
  m(1049, 'History v2: one record read for the whole screen, and a linear duplicate sweep (CUL-1228)', 'claude/kind-pascal-fqyv0h', '2026-10-04T14:01:36Z', '2026-10-04T14:38:50Z'),
  m(1050, 'Signal screen: one count over the engine\'s windows on local days, composed from the chart (CUL-1568)', 'claude/happy-hopper-teknu1', '2026-10-04T14:34:37Z', '2026-10-04T15:14:16Z'),
  m(1051, `${OOB} PR-43d: a bowl that held every counted day leaves no meals-logged ratio (CUL-1572)`, `${OOB_BRANCH}-pr43d-10041450`, '2026-10-04T15:03:34Z', '2026-10-04T15:25:16Z'),
  m(1053, `${OOB} PR-27b: Home's Signal rows state the screen's counts`, `${OOB_BRANCH}-pr27b-10041526`, '2026-10-04T15:42:12Z', '2026-10-04T16:21:19Z'),
  m(1054, `${OOB} PR-28: a timing or correlation lead takes the row's face, never the weekly bars`, `${OOB_BRANCH}-pr28-10041622`, '2026-10-04T16:34:15Z', '2026-10-04T16:48:35Z'),
  m(1055, `${OOB} PR-27c: the phone script and Get ready state the Signal screen's one count`, `${OOB_BRANCH}-pr27c-10041622`, '2026-10-04T16:50:56Z', '2026-10-04T17:32:46Z'),
  m(1056, `${OOB} PR-34: a rose the phone already had never blinks out`, `${OOB_BRANCH}-pr34-10041649`, '2026-10-04T17:14:14Z', '2026-10-04T17:27:19Z'),
  m(1057, `${OOB} PR-43e: a bowl that held part of the trial takes the meals-logged ratio`, `${OOB_BRANCH}-pr43e-10041654`, '2026-10-04T17:16:09Z', '2026-10-04T17:43:33Z'),
  m(1058, `${OOB} PR-34b: a failed look keeps only the rose on Home and History`, `${OOB_BRANCH}-pr34b-10041746`, '2026-10-04T17:55:58Z', '2026-10-04T18:29:12Z'),
  m(1059, `${OOB} PR-35: a worth-a-call with no photo reaches the month`, `${OOB_BRANCH}-pr35-10041737`, '2026-10-04T18:02:22Z', '2026-10-04T18:47:58Z'),
  m(1060, `${OOB} PR-29: Home's trial card is a title, a neutral bar and one line that opens with the end date`, `${OOB_BRANCH}-pr29-10041757`, '2026-10-04T18:10:28Z', '2026-10-04T18:44:34Z'),
  m(1061, `${OOB} PR-24b: a test pins the month's call under every lens and with the symptom layer off`, `${OOB_BRANCH}-pr24b-10041850`, '2026-10-04T18:56:18Z', '2026-10-04T19:04:10Z'),
  m(1062, `${OOB} PR-39b: a failed record read says so on the window sheet`, `${OOB_BRANCH}-pr39b-10041850`, '2026-10-04T19:05:02Z', '2026-10-04T19:18:43Z'),
  m(1063, `${OOB} PR-39c: a visit or medicine start before the first log shows, and a visit-only record is not empty`, `${OOB_BRANCH}-pr39c-10041920`, '2026-10-04T19:37:12Z', '2026-10-04T19:57:05Z'),
  m(1065, `${OOB} PR-25b: a safety finding that reaches a focused Home is spoken`, `${OOB_BRANCH}-pr25b-10042110`, '2026-10-04T21:22:48Z', '2026-10-04T21:41:54Z'),
  m(1066, `${OOB} PR-50: Noticed stops reading its beta flag and leaves the early-access shelf`, `${OOB_BRANCH}-pr50-10042105`, '2026-10-04T21:27:55Z', '2026-10-04T23:32:00Z'),
  m(1067, `${OOB} PR-11b: generate-report prints Noticed notes only when a request asks`, `${OOB_BRANCH}-pr11b-10042332`, '2026-10-04T23:52:13Z', '2026-10-05T00:03:51Z'),
  m(1068, `${OOB} PR-51: the trial screen for every account, the flag and its flag-off paths deleted`, `${OOB_BRANCH}-pr51-10050004`, '2026-10-05T00:28:47Z', '2026-10-05T00:51:14Z'),
  m(1069, `${OOB} PR-52: History v2 for every account, the flag and v1's History deleted`, `${OOB_BRANCH}-pr52-10050054`, '2026-10-05T01:42:02Z', '2026-10-05T01:53:37Z'),
  m(1070, `${OOB} PR-53: Design v2 for every account, the flag and the old Home and Patterns deleted`, `${OOB_BRANCH}-pr53-10051028`, '2026-10-05T11:08:23Z', '2026-10-05T12:24:51Z'),
];

// #1064 (Out of beta PR-60): open since 10/4, newest commit 2026-10-04T21:15:53Z. Files
// from GitHub's files list.
export const PR_1064: PrFact = {
  number: 1064,
  title: `${OOB} PR-60: delete the three retired app_config rows (migration 084) and record the graduations`,
  state: 'open',
  headRef: `${OOB_BRANCH}-pr60-10042110`,
  createdAt: '2026-10-04T21:16:27Z',
  updatedAt: '2026-10-05T20:48:31Z',
  lastCommitAt: '2026-10-04T21:15:53Z',
  files: [
    'CLAUDE.md',
    'STATUS.md',
    'docs/dev-handoff-runbook.md',
    'docs/nyx-beta-features-requirements.md',
    'docs/nyx-event-taxonomy-requirements.md',
    'docs/nyx-more-events-picker-requirements.md',
    'docs/nyx-vet-visits-requirements.md',
    'docs/sessions/2026-10-04-out-of-beta-pr60-retire-three-rows.md',
    'supabase/migrations/084_retire_log_picker_event_types_vet_visits_flags.sql',
  ],
};

// #1072 (Engines v3 PR-36): open at 21:10Z (merged 23:03Z). Its files list is GitHub's
// first page of 30; the rest is not read (a stated limit, plan.ts's header).
export const PR_1072_AT_2110: PrFact = {
  number: 1072,
  title: 'Engines v3 PR-36: the call record, the follow-up screen, the notification (EN-14 client)',
  state: 'open',
  headRef: 'claude/engines-v3-pr36-10051717',
  createdAt: '2026-10-05T18:13:17Z',
  files: [
    'app/(tabs)/index.tsx',
    'app/_layout.tsx',
    'app/event/[id].tsx',
    'app/settings/notifications.tsx',
    'app/vet-call/[id].tsx',
    'app/vet-visits/index.tsx',
    'components/event/CallAnswers.tsx',
    'components/historyV2/DayCard.tsx',
    'components/home/FollowUpLine.tsx',
    'components/settings/FollowUpNotificationRow.tsx',
    'docs/sessions/2026-10-05-engines-v3-pr36-call-record.md',
    'guards/visitReaders.test.ts',
    'hooks/useAppConfig.ts',
    'hooks/useEn14.ts',
    'hooks/useFollowUps.ts',
    'lib/appConfig.ts',
    'lib/followUpNotifications.ts',
    'lib/historyDays.ts',
    'lib/historyScreen.ts',
  ],
};

// #1074 (CUL-1605, of CUL-1602 = row 36a): open at 21:10Z (merged 21:33Z). Its 084 was
// applied to production at 20:19Z, while #1064 had held 084 since 10/4.
export const PR_1074_AT_2110: PrFact = {
  number: 1074,
  title: "Migration 084: a call's cover stored on the call (CUL-1605)",
  state: 'open',
  headRef: 'claude/engines-v3-call-cover-migration',
  createdAt: '2026-10-05T20:02:10Z',
  lastCommitAt: '2026-10-05T20:02:10Z',
  files: ['docs/sessions/2026-10-05-engines-v3-call-cover-migration.md', 'guards/careRecord.test.ts', 'supabase/migrations/084_vet_call_cover.sql'],
};

// Main's migrations through 083 (084 landed on main only at 21:33Z).
export const MAIN_MIGRATIONS_THROUGH_083 = Array.from({ length: 83 }, (_, i) => `${String(i + 1).padStart(3, '0')}_x.sql`);

export const ISSUES: Record<string, IssueFact> = {
  'CUL-1605': { id: 'CUL-1605', state: 'In Review', parentId: 'CUL-1602' },
  'CUL-1602': { id: 'CUL-1602', state: 'In Progress' },
  'CUL-1600': { id: 'CUL-1600', state: 'In Progress' },
  'CUL-1568': { id: 'CUL-1568', state: 'Done', parentId: 'CUL-1217' },
  'CUL-1519': { id: 'CUL-1519', state: 'Done' },
  'CUL-1313': { id: 'CUL-1313', state: 'Todo', labels: ['Waiting on PM'] },
};

// Launches, read from the `/dispatch run` updates and, where an update never recorded one
// (Out of beta PR-60, one of the retro's "launches never recorded"), from the dispatch
// claim on the row's issue, which names the session (CUL-963, 2026-10-04T21:07Z).
export const LAUNCHES: Launch[] = [
  { project: 'Out of beta', row: '60', issue: 'CUL-963', session: 'session_01AQc4pTgqnMDXUUP7QHg7KT', branch: `${OOB_BRANCH}-pr60-10042110`, at: '2026-10-04T21:10:00Z', how: 'picked' },
  { project: 'Out of beta', row: '53', issue: 'CUL-1071', session: 'session_011YVvvinFUAKr5LjxJ5yzzp', branch: `${OOB_BRANCH}-pr53-10051028`, at: '2026-10-05T10:28:04Z', how: 'picked' },
  // Engines v3 PR-36 and PR-23b: their branches carry the launch minute (UTC).
  { project: 'Engines v3', row: '36', issue: 'CUL-1419', session: 'session_01NeUPJVsDa7Frjvn23xfnqp', branch: 'claude/engines-v3-pr36-10051717', at: '2026-10-05T17:17:00Z', how: 'picked' },
  { project: 'Engines v3', row: '23b', issue: 'CUL-1545', session: 'session_01RhfigkrQWqKAxw4scUFfA4', branch: 'claude/engines-v3-pr23b-10051806', at: '2026-10-05T18:06:00Z', how: 'picked' },
];

// At 21:10Z both Engines v3 sessions waited on the PM (PR-36 on CUL-1604's apply decision,
// PR-23b's on CUL-1600's A/B/C); PR-60's had stopped at its merge gate on 10/4.
export const SESSIONS_AT_2110: Record<string, SessionBucket> = {
  session_01AQc4pTgqnMDXUUP7QHg7KT: 'completed',
  session_011YVvvinFUAKr5LjxJ5yzzp: 'completed',
  session_01NeUPJVsDa7Frjvn23xfnqp: 'blocked',
  session_01RhfigkrQWqKAxw4scUFfA4: 'blocked',
};

// PR-23b's session claimed CUL-1600 (row 23c) outside a launch at 19:06Z.
export const CLAIMS_AT_2110: ClaimFact[] = [
  { issue: 'CUL-1600', branch: 'claude/engines-v3-pr23b-10051806', at: '2026-10-05T19:06:00Z', session: 'session_01RhfigkrQWqKAxw4scUFfA4' },
];

export const PRODUCTION_LIB = [
  'lib/careClaimScreens.ts', 'lib/dietTrial.ts', 'lib/findingIdentity.ts', 'lib/foodFormat.ts', 'lib/freeFedIntake.ts',
  'lib/incidentFloor.ts', 'lib/incidentTier.ts', 'lib/incidentVerdict.ts', 'lib/lookDayCounts.ts', 'lib/maskingSpans.ts',
  'lib/mealTiming.ts', 'lib/medicationHistory.ts', 'lib/medications.ts', 'lib/protein.ts', 'lib/rateContrast.ts',
  'lib/stoolForm.ts', 'lib/symptomEpisodes.ts', 'lib/trialProtein.ts', 'lib/trialResponseCounts.ts', 'lib/utils.ts',
  'lib/vomitContents.ts', 'lib/weightStory.ts', 'lib/weightUnits.ts',
];
