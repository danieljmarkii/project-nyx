// /sweep's deterministic half (CUL-2651): which loose issues launch, in what order, as
// what kind of session, bundled with what, and which are held with the reason in words.
// `.claude/commands/sweep.md` steps 3 to 5, as a function.
//
// WHY A SCRIPT. Same law as scripts/dispatch/ (L2): a rule in prose fires approximately
// never, a rule in a tested function fires every time. The sweep's JUDGMENT comes in as
// data (the impact tier and the owner-visible sentence behind it, the size, the files, the
// relevance verdict and its evidence, the team's recommendations); this decides nothing a
// judgment should, and every judgment it relies on must be stated, or `validate` refuses.
//
// WHAT THE RESEARCH CHANGED (CUL-2651 plan comment, 2026-11-07):
//   - A lexicographic order, never a composite score. RICE and WSJF built on guesses reward
//     cheap work and invite inflation; a fixed order over stated facts does neither.
//   - Close on evidence only. `fixed` and `superseded` need the merge, commit or successor
//     that proves them, or they read as `unclear` and go to shaping; age closes nothing.
//   - Review capacity gates launches, not agent count. A plan-gated or shaping session waits
//     on the PM, so it spends one of dispatch's three waiting-on-PM places; a build session
//     merges itself on the steward gate and spends none.
//   - Size for the band agents finish reliably: S and M build, L plans first, XL shapes.
//
// Pure: every fact is an argument. The I/O shell is cli.ts.
//
// STATED BLIND SPOTS (C-38):
//   - Files are what the sweep's relevance read names. A pick that edits a file its read
//     never named is caught only when its PR opens, by the next run's in-flight files.
//   - `blocksLiveTrack` and `liveHarm` are what Linear says; a missing relation reads false.
//   - Two candidates on the same surface with disjoint files still bundle: the surface is
//     the sweep's word that they belong in one session.

export const MAX_SESSIONS = 6; // the repo-wide cap, CUL-1606 D1
export const WAITING_ON_PM_LIMIT = 3; // dispatch.md step 4's sub-limit
export const FINDINGS_CAP = 3; // new non-harm issues one session may file (PM tip, 2026-11-07)
export const BUNDLE_MAX_ISSUES = 3;
export const IMPACT_A_SHARE_WARN = 0.2; // above it the A tier is inflating (research §1)

export type Impact = 'A' | 'B' | 'C' | 'D';
// A: an owner or a vet sees wrong or missing data, or a flow that breaks.
// B: an owner sees friction, a confusing screen, or wrong copy.
// C: internal work that protects an owner surface (a test, a guard, CI on a user path).
// D: internal only (docs, tooling, tidy-up).
export type Size = 'S' | 'M' | 'L' | 'XL'; // S one file · M one surface · L several · XL more than one session
// valid: still true on main · updated: true, but the description is out of date · fixed: a
// merge already did it · superseded: a later version replaced it · duplicate: of another
// open issue · unclear: the read cannot tell, so it shapes.
export type Relevance = 'valid' | 'updated' | 'fixed' | 'superseded' | 'duplicate' | 'unclear';
export type Kind = 'build' | 'plan' | 'shape';

export type TeamRead = { persona: string; rec: string };

export type SweepCandidate = {
  id: string;
  title: string;
  priority: number; // Linear: 0 none, 1 urgent … 4 low
  labels: string[];
  createdAt: string;
  impact: Impact;
  impactWhy: string; // the sentence an owner or vet would see; required for A and B
  size: Size;
  files: string[]; // what the relevance read says the work edits
  surface: string; // the bundle key: one screen, function or module, in the sweep's words
  relevance: Relevance;
  relevanceWhy: string;
  evidence?: string; // the merge, commit, successor or duplicate that proves fixed / superseded / duplicate
  blocksLiveTrack?: boolean;
  liveClaim?: string; // another branch's live claim
  openPr?: number; // an open PR already referencing it
  needsShaping?: string; // why, when the work cannot be built from its description
  team: TeamRead[];
  doneWhen?: string;
};

export type InFlight = { holder: string; files: string[] };

export type SweepInput = {
  candidates: SweepCandidate[];
  inFlight: InFlight[]; // every open PR (files) and every running session's declared files
  slotsFree: number; // dispatch's Slots line, after every track's work
  waitingOnPm: number; // dispatch's waiting-on-the-PM count, every project
  vetoed?: string[]; // `go except CUL-NNN`
};

export type SweepPick = {
  kind: Kind;
  issues: string[]; // lead first
  what: string;
  size: Size;
  files: string[];
  why: string;
  team: TeamRead[];
  doneWhen: string;
  liveHarm: boolean;
};

export type LinearWrite =
  | { id: string; action: 'close-done'; why: string }
  | { id: string; action: 'propose-close'; why: string }
  | { id: string; action: 'duplicate'; of: string; why: string }
  | { id: string; action: 'update-description'; why: string };

export type SweepResult = {
  picks: SweepPick[];
  held: { id: string; reason: string }[];
  writes: LinearWrite[];
  warnings: string[];
};

const IMPACT_ORDER: Record<Impact, number> = { A: 0, B: 1, C: 2, D: 3 };
const SIZE_WEIGHT: Record<Size, number> = { S: 1, M: 3, L: 6, XL: 12 };
const priorityRank = (p: number) => (p >= 1 && p <= 4 ? p : 5); // "no priority" sorts last
export const isLiveHarm = (c: SweepPick | SweepCandidate) => ('labels' in c ? c.labels.includes('Live harm') : c.liveHarm);
const GATED_LABELS = ['Gate: clinical', 'Gate: privacy', 'Area: Privacy/RLS'];

// A merge the PM must type (steward §7, CUL-1654): landing deploys an Edge Function or edits
// the gate's files, or the PR holds a migration only the PM's `apply` lands. A build on these
// files waits on the PM like a plan does, so it spends one of the three places.
const PM_MERGE_PATHS = ['supabase/functions/', 'supabase/migrations/', '.claude/hooks/', '.claude/settings', '.github/workflows/', 'scripts/steward/', 'scripts/deploy'];
export const touchesPmMerge = (files: string[]) => files.some((f) => PM_MERGE_PATHS.some((p) => f.startsWith(p)));
export const waitsOnPm = (kind: Kind, files: string[]) => kind !== 'build' || touchesPmMerge(files);

// Evidence a close can stand on: a PR number, a commit hash, or the issue that replaced it.
// Prose ("main no longer has it") is a reason, not evidence (code-reviewer, 2026-11-07).
const EVIDENCE = /(^|[^\w])#\d+\b|\b[0-9a-f]{7,40}\b|\bCUL-\d+\b/;
export const usableEvidence = (c: SweepCandidate) => {
  const ev = c.evidence?.trim() ?? '';
  const m = ev.match(new RegExp(EVIDENCE.source, 'g')) ?? [];
  return m.some((x) => x.trim() !== c.id) ? ev : '';
};

// Every judgment the order relies on must be stated. A refusal names the issue and the gap.
export function validate(input: SweepInput): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const c of input.candidates) {
    if (seen.has(c.id)) errs.push(`${c.id}: listed twice`);
    seen.add(c.id);
    if ((c.impact === 'A' || c.impact === 'B') && !c.impactWhy.trim()) errs.push(`${c.id}: tier ${c.impact} with no owner-visible sentence`);
    if (!c.relevanceWhy.trim()) errs.push(`${c.id}: no relevance reason`);
    if (c.team.length === 0 && !closes(c)) errs.push(`${c.id}: no team read${c.relevance === 'valid' || c.relevance === 'updated' || c.relevance === 'unclear' ? '' : ' (its closing verdict has no usable evidence, so it can launch)'}`);
  }
  if (!Number.isInteger(input.slotsFree) || input.slotsFree < 0) errs.push(`slotsFree must be a whole number, got ${input.slotsFree}`);
  return errs;
}

// The order (research §1: lexicographic, never a score). Ties break on the id so a run is
// reproducible.
export function compare(a: SweepCandidate, b: SweepCandidate): number {
  return (
    Number(isLiveHarm(b)) - Number(isLiveHarm(a)) ||
    IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(!!b.blocksLiveTrack) - Number(!!a.blocksLiveTrack) ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.id.localeCompare(b.id, 'en', { numeric: true })
  );
}

// CLAUDE.md: anything touching RLS, Storage, deletion or export is never mechanical: it plans
// first and gets the rls-privacy-reviewer. dispatch's gate predicate (step 5) plan-gates the
// same rows at launch, so the sweep must count them as waiting too (first run, 2026-11-08).
const PLAN_PATHS = ['lib/storage.ts', 'supabase/migrations/', 'supabase/functions/delete-account/', 'supabase/functions/export', 'lib/deleteAccount', 'lib/export'];
const touchesPlanPath = (files: string[]) => files.some((f) => PLAN_PATHS.some((p) => f.startsWith(p)));

export function kindOf(c: SweepCandidate): Kind {
  if (c.needsShaping || c.relevance === 'unclear' || c.size === 'XL') return 'shape';
  if (c.size === 'L' || c.labels.some((l) => GATED_LABELS.includes(l)) || touchesPlanPath(c.files)) return 'plan';
  return 'build';
}

const overlap = (a: string[], b: string[]) => a.some((f) => b.includes(f));

// A closing verdict closes only on usable evidence, and never under someone's live work:
// a claim or an open PR means the issue is being worked, whatever the read says.
function closes(c: SweepCandidate): boolean {
  if (c.liveClaim || c.openPr) return false;
  const w = relevanceWrite(c);
  return w !== null && w !== 'unclear' && w.action !== 'update-description';
}

// Linear's half of the relevance read. Evidence, never age, closes anything.
function relevanceWrite(c: SweepCandidate): LinearWrite | 'unclear' | null {
  const ev = usableEvidence(c);
  switch (c.relevance) {
    case 'fixed':
      return ev ? { id: c.id, action: 'close-done', why: `${c.relevanceWhy} (${ev})` } : 'unclear';
    case 'superseded':
      return ev ? { id: c.id, action: 'propose-close', why: `${c.relevanceWhy} (${ev})` } : 'unclear';
    case 'duplicate':
      { const of = ev ? /CUL-\d+/.exec(ev)?.[0] : undefined; return of && of !== c.id ? { id: c.id, action: 'duplicate', of, why: c.relevanceWhy } : 'unclear'; }
    case 'updated':
      return { id: c.id, action: 'update-description', why: c.relevanceWhy };
    default:
      return null;
  }
}

export function rankSweep(input: SweepInput): SweepResult {
  const errs = validate(input);
  if (errs.length) throw new Error(`sweep facts refused:\n  ${errs.join('\n  ')}`);

  const held: SweepResult['held'] = [];
  const writes: LinearWrite[] = [];
  const warnings: string[] = [];
  const vetoed = new Set(input.vetoed ?? []);

  // 1. Relevance: closed work leaves the pool; a closing verdict with no evidence shapes.
  const pool: SweepCandidate[] = [];
  for (const c of input.candidates) {
    // Live work outranks the read: no close is written, and the claim or PR holds it below.
    const w = c.liveClaim || c.openPr ? (c.relevance === 'updated' ? relevanceWrite(c) : null) : relevanceWrite(c);
    if (w === 'unclear') {
      pool.push({ ...c, relevance: 'unclear', needsShaping: c.needsShaping ?? `${c.relevance} with no evidence named` });
      continue;
    }
    if (w) writes.push(w);
    if (w && w.action !== 'update-description') continue;
    pool.push(c);
  }

  // Calibration (research §1): Live harm is tier A by right, so only the rest is measured,
  // and a pool under five is too small for a share to mean anything.
  const rest = pool.filter((c) => !isLiveHarm(c));
  const restA = rest.filter((c) => c.impact === 'A').length;
  if (rest.length >= 5 && restA / rest.length > IMPACT_A_SHARE_WARN) warnings.push(`${restA} of ${rest.length} non-harm candidates are tier A (over ${IMPACT_A_SHARE_WARN * 100}%): the tier is inflating; re-read the A sentences`);

  pool.sort(compare);

  // 2. Walk the order: hold what cannot start, bundle what belongs together, keep files disjoint.
  const picks: SweepPick[] = [];
  const taken = new Set<string>();
  let waiting = input.waitingOnPm;
  const slots = Math.min(MAX_SESSIONS, input.slotsFree);

  for (const c of pool) {
    if (taken.has(c.id)) continue;
    const hold = (reason: string) => { held.push({ id: c.id, reason }); taken.add(c.id); };
    if (vetoed.has(c.id)) { hold('vetoed by the PM'); continue; }
    if (c.liveClaim) { hold(`claimed by ${c.liveClaim}`); continue; }
    if (c.openPr) { hold(`open PR #${c.openPr} already references it`); continue; }
    const kind = kindOf(c);
    if (kind !== 'shape' && c.files.length === 0) { hold('its files are not named, so overlap cannot be checked'); continue; }

    // The lead's own files decide whether it can start; a member never holds it.
    const busy = (fs: string[]) => input.inFlight.find((f) => overlap(f.files, fs))?.holder ?? (picks.find((p) => overlap(p.files, fs)) ? `this batch's ${picks.find((p) => overlap(p.files, fs))!.issues[0]}` : undefined);
    const leadBusy = busy(c.files);
    if (leadBusy) { hold(`files overlap ${leadBusy}`); continue; }
    if (picks.length >= slots) { hold(`no free slot (${slots} this run)`); continue; }
    const leadWaits = waitsOnPm(kind, c.files);
    if (leadWaits && waiting >= WAITING_ON_PM_LIMIT) { hold(`waits on the PM${kind === 'build' ? ' to merge (it deploys or touches the gate)' : ''}, and ${WAITING_ON_PM_LIMIT} already do`); continue; }

    // Bundle: later candidates on the same surface (or the same files), each clean on its
    // own, of the build kind, while the bundle stays M. A member that is not clean stays in
    // the pool and is judged on its own turn.
    const members: SweepCandidate[] = [c];
    if (kind === 'build') {
      let weight = SIZE_WEIGHT[c.size];
      for (const o of pool) {
        if (o === c || taken.has(o.id) || members.length >= BUNDLE_MAX_ISSUES) continue;
        if (vetoed.has(o.id) || o.liveClaim || o.openPr || kindOf(o) !== 'build' || o.files.length === 0 || busy(o.files)) continue;
        // A member never turns a bundle into one that waits on the PM when no place is free.
        if (!leadWaits && waiting >= WAITING_ON_PM_LIMIT && touchesPmMerge(o.files)) continue;
        const same = o.surface.trim().toLowerCase() === c.surface.trim().toLowerCase() || overlap(o.files, members.flatMap((m) => m.files));
        if (!same || weight + SIZE_WEIGHT[o.size] > SIZE_WEIGHT.M) continue;
        weight += SIZE_WEIGHT[o.size];
        members.push(o);
      }
    }
    const files = [...new Set(members.flatMap((m) => m.files))];

    if (waitsOnPm(kind, files)) waiting += 1;
    members.forEach((m) => taken.add(m.id));
    picks.push({
      kind,
      issues: members.map((m) => m.id),
      what: c.title,
      size: members.length > 1 ? 'M' : c.size,
      files,
      why: whyOf(c, kind, members.length),
      team: members.flatMap((m) => m.team.map((t) => (members.length > 1 ? { ...t, rec: `${m.id}: ${t.rec}` } : t))),
      doneWhen: members.map((m) => m.doneWhen?.trim()).filter(Boolean).join(' ') || "the issue's acceptance criteria pass",
      liveHarm: members.some(isLiveHarm),
    });
  }
  return { picks, held, writes, warnings };
}

function whyOf(c: SweepCandidate, kind: Kind, n: number): string {
  const parts: string[] = [];
  if (isLiveHarm(c)) parts.push('Live harm');
  parts.push(`tier ${c.impact}${c.impactWhy.trim() ? `: "${c.impactWhy.trim()}"` : ''}`);
  if (c.priority >= 1 && c.priority <= 2) parts.push(c.priority === 1 ? 'Urgent' : 'High');
  if (c.blocksLiveTrack) parts.push('blocks a live track');
  if (n > 1) parts.push(`bundled ${n} on ${c.surface}`);
  if (kind === 'plan') parts.push(c.size === 'L' ? 'size L, plans first' : 'gated surface, plans first');
  if (kind === 'shape') parts.push(`needs shaping: ${c.needsShaping ?? (c.size === 'XL' ? 'too big for one session' : 'relevance unclear')}`);
  return parts.join(' · ');
}

// Session names (PM, 2026-11-07: descriptive, many runs a day). The what leads.
export function sessionTitle(p: SweepPick): string {
  const cut = p.what.slice(0, 47);
  const what = p.what.length > 48 ? `${(cut.lastIndexOf(' ') > 20 ? cut.slice(0, cut.lastIndexOf(' ')) : cut).trimEnd()}…` : p.what;
  const ids = p.issues.length > 1 ? `${p.issues[0]} +${p.issues.length - 1}` : p.issues[0];
  const tag = p.kind === 'shape' ? 'Shape' : 'Sweep';
  return `${tag} · ${what} · ${ids}`;
}

export function sweepRunTitle(now: Date, launched: number): string {
  const when = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now).replace(' AM', 'am').replace(' PM', 'pm');
  return `Sweep · ${when} · ${launched} launched`;
}

// The run-order rows and build notes for the Loose ends page, in dispatch's grammar
// (page.ts), numbered from `next`. The sweep owns this page's table and notes; the Board
// stays dispatch's.
export function pageRows(picks: SweepPick[], next: number): { rows: string[]; notes: string[]; doneMeans: string } {
  // page.ts reads a PR number as exactly two digits (ROW_ID), so the page holds 01 to 99.
  if (!Number.isInteger(next) || next < 1 || next + picks.length - 1 > 99) throw new Error(`Loose ends rows run 01 to 99; nextRow ${next} with ${picks.length} picks does not fit: prune merged rows and renumber from 01`);
  const ids = picks.map((_, i) => String(next + i).padStart(2, '0'));
  const clean = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const rows = picks.map((p, i) => `| ${ids[i]} | ${p.issues.join(' · ')} | ${clean(p.what)} | — | ${p.kind} |`);
  const notes = picks.map((p, i) => {
    const mode = p.kind === 'shape' ? 'A shaping brief (DISCOVERY): the session reads the code, answers its own technical questions, convenes the team, and posts a decision brief with its appetite on the issue; it builds only on the PM\'s go typed in its session, and only what fits one session.' : p.kind === 'plan' ? `Plan-gated (${p.size === 'L' ? 'size L' : 'a gated surface'}): post the plan and wait for the PM's go.` : 'Routine: build from this note.';
    const team = p.team.map((t) => `${t.persona}: ${clean(t.rec)}`).join('; ');
    return `**PR-${ids[i]}:** ${mode} Why: ${clean(p.why)}. Files: ${p.files.join(', ') || 'none named (shaping)'}. Team: ${team}. Done when: ${clean(p.doneWhen)}. Circuit breaker: if the work outgrows size ${p.size}, stop and return a brief; no second attempt.`;
  });
  return { rows, notes, doneMeans: `Done means (rows): ${ids.join(', ')}` };
}

// The measurement line each sweep's status update carries (CUL-1876 reads it).
export function metricsLine(m: { launched: number; merged: number; abandoned: number; launchToMergeHours: number[] }): string {
  const xs = [...m.launchToMergeHours].sort((a, b) => a - b);
  const median = xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null;
  return `Sweep metrics: launched ${m.launched} · merged ${m.merged} · abandoned ${m.abandoned} · launch to merge ${median === null ? 'n/a' : `median ${median.toFixed(1)}h over ${xs.length}`}`;
}
