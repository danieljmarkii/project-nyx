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

export type Pick = {
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
  picks: Pick[];
  held: { id: string; reason: string }[];
  writes: LinearWrite[];
  warnings: string[];
};

const IMPACT_ORDER: Record<Impact, number> = { A: 0, B: 1, C: 2, D: 3 };
const SIZE_WEIGHT: Record<Size, number> = { S: 1, M: 3, L: 6, XL: 12 };
const priorityRank = (p: number) => (p >= 1 && p <= 4 ? p : 5); // "no priority" sorts last
export const isLiveHarm = (c: Pick | SweepCandidate) => ('labels' in c ? c.labels.includes('Live harm') : c.liveHarm);
const GATED_LABELS = ['Gate: clinical', 'Gate: privacy', 'Area: Privacy/RLS'];

// Every judgment the order relies on must be stated. A refusal names the issue and the gap.
export function validate(input: SweepInput): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const c of input.candidates) {
    if (seen.has(c.id)) errs.push(`${c.id}: listed twice`);
    seen.add(c.id);
    if ((c.impact === 'A' || c.impact === 'B') && !c.impactWhy.trim()) errs.push(`${c.id}: tier ${c.impact} with no owner-visible sentence`);
    if (!c.relevanceWhy.trim()) errs.push(`${c.id}: no relevance reason`);
    if (c.team.length === 0 && c.relevance !== 'fixed' && c.relevance !== 'superseded' && c.relevance !== 'duplicate') errs.push(`${c.id}: no team read`);
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
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id, 'en', { numeric: true })
  );
}

export function kindOf(c: SweepCandidate): Kind {
  if (c.needsShaping || c.relevance === 'unclear' || c.size === 'XL') return 'shape';
  if (c.size === 'L' || c.labels.some((l) => GATED_LABELS.includes(l))) return 'plan';
  return 'build';
}

const overlap = (a: string[], b: string[]) => a.some((f) => b.includes(f));

// Linear's half of the relevance read. Evidence, never age, closes anything.
function relevanceWrite(c: SweepCandidate): LinearWrite | 'unclear' | null {
  const ev = c.evidence?.trim();
  switch (c.relevance) {
    case 'fixed':
      return ev ? { id: c.id, action: 'close-done', why: `${c.relevanceWhy} (${ev})` } : 'unclear';
    case 'superseded':
      return ev ? { id: c.id, action: 'propose-close', why: `${c.relevanceWhy} (${ev})` } : 'unclear';
    case 'duplicate':
      return ev && /CUL-\d+/.test(ev) ? { id: c.id, action: 'duplicate', of: /CUL-\d+/.exec(ev)![0], why: c.relevanceWhy } : 'unclear';
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
    const w = relevanceWrite(c);
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
  const picks: Pick[] = [];
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

    // Bundle: later candidates on the same surface, of the same kind, while the bundle stays M.
    const members: SweepCandidate[] = [c];
    if (kind === 'build') {
      let weight = SIZE_WEIGHT[c.size];
      for (const o of pool) {
        if (o === c || taken.has(o.id) || members.length >= BUNDLE_MAX_ISSUES) continue;
        if (vetoed.has(o.id) || o.liveClaim || o.openPr || kindOf(o) !== 'build' || o.files.length === 0) continue;
        const same = o.surface.trim().toLowerCase() === c.surface.trim().toLowerCase() || overlap(o.files, members.flatMap((m) => m.files));
        if (!same || weight + SIZE_WEIGHT[o.size] > SIZE_WEIGHT.M) continue;
        weight += SIZE_WEIGHT[o.size];
        members.push(o);
      }
    }
    const files = [...new Set(members.flatMap((m) => m.files))];

    const holder = input.inFlight.find((f) => overlap(f.files, files));
    if (holder) { members.forEach((m) => { held.push({ id: m.id, reason: `files overlap ${holder.holder}` }); taken.add(m.id); }); continue; }
    const clash = picks.find((p) => overlap(p.files, files));
    if (clash) { members.forEach((m) => { held.push({ id: m.id, reason: `files overlap this batch's ${clash.issues[0]}` }); taken.add(m.id); }); continue; }

    if (picks.length >= slots) { members.forEach((m) => { held.push({ id: m.id, reason: `no free slot (${slots} this run)` }); taken.add(m.id); }); continue; }
    if (kind !== 'build' && waiting >= WAITING_ON_PM_LIMIT) { hold(`waits on the PM, and ${WAITING_ON_PM_LIMIT} already do`); continue; }

    if (kind !== 'build') waiting += 1;
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
export function sessionTitle(p: Pick): string {
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
export function pageRows(picks: Pick[], next: number): { rows: string[]; notes: string[]; doneMeans: string } {
  const ids = picks.map((_, i) => String(next + i));
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
