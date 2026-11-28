// Proves each of the suite's checks by breaking the source it guards (CUL-1615's "each
// check proven by mutation"; CLAUDE.md C-18: a guard is proven by mutation, not by
// reading the test). Each mutant replaces ONE exact string, runs this directory's jest
// suite, expects it RED, and restores the file whatever happens.
//
//   node --experimental-strip-types scripts/dispatch/mutants.ts [--only <file>]
//
// `--only preflight.ts` runs one file's mutants, for iterating; the full run is the proof.
//
// Exit 0 when every mutant is killed; 1 when one survives or a mutant's anchor no longer
// matches exactly once (the anchor drifted from the source: fix the mutant, never skip it).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '../..');

type Mutant = { check: string; file: string; from: string; to: string };

const MUTANTS: Mutant[] = [
  // The 21:10Z slot arithmetic.
  { check: 'slots are cap minus in flight', file: 'plan.ts', from: 'const rawSlots = cap - inFlight.length;', to: 'const rawSlots = cap - inFlight.length + 1;' },
  { check: 'a parked PR takes no slot', file: 'plan.ts', from: '    if (pr && parkedPrs.has(pr.number)) continue;\n', to: '' },
  { check: 'in flight is deduplicated by issue and branch', file: 'plan.ts', from: 'if (f.issues.some((i) => seenIssue.has(i)) || (f.branch && seenBranch.has(f.branch))) return;', to: 'if (false) return;' },
  { check: 'a stale claim is not live', file: 'plan.ts', from: 'return now - ms(c.at) < DAY || open;', to: 'return true;' },
  { check: 'a first dispatch has one slot', file: 'plan.ts', from: 'firstDispatch ? Math.min(1, rawSlots) : rawSlots', to: 'rawSlots' },
  { check: 'two sub-issues of one parent are two in flight', file: 'plan.ts', from: '      issues: named,', to: "      issues: [...named, ...named.map((i) => input.issues[i]?.parentId ?? '')].filter(Boolean)," },
  { check: 'a combined row obeys rules naming its parts', file: 'plan.ts', from: 'const mine = partsOf(row.id).filter', to: 'const mine = [row.id].filter' },
  { check: 'a blocker After names is one hold (CUL-2249)', file: 'plan.ts', from: 'if (b.open && !v.holds.some((h) => h.key === b.id)) {', to: 'if (b.open) {' },
  { check: 'a blocker After does not name still holds', file: 'plan.ts', from: 'if (b.open && !v.holds.some((h) => h.key === b.id)) {', to: 'if (false) {' },
  // The 084 clash.
  { check: 'the lower PR (or main) keeps a clashing number', file: 'plan.ts', from: '({ number, keeps: h[0], renumbers: h.slice(1) })', to: '({ number, keeps: h[h.length - 1], renumbers: h.slice(0, -1) })' },
  { check: 'a clashing row is held', file: 'plan.ts', from: "if (r.startsWith(`#${state.pr} `) || r === `#${state.pr}`) v.reasons.push", to: 'if (false) v.reasons.push' },
  { check: 'the next migration number is past every reserved one', file: 'plan.ts', from: 'String(top + 1).padStart(3, ', to: 'String(top).padStart(3, ' },
  { check: 'migrations are one at a time', file: 'plan.ts', from: 'used.migrations >= SUB_LIMITS.migrations', to: 'used.migrations > SUB_LIMITS.migrations' },
  // Selection.
  { check: 'a merged row is never proposed', file: 'plan.ts', from: "verdicts.filter((v) => v.row && v.state.kind !== 'merged' && !v.reasons.length)", to: 'verdicts.filter((v) => v.row && !v.reasons.length)' },
  { check: 'an unmerged After PR holds', file: 'plan.ts', from: 'if (!merged(a.row)) v.reasons.push', to: 'if (false) v.reasons.push' },
  { check: 'defect 2: a merged After PR never holds ("waiting on PR-53")', file: 'plan.ts', from: 'if (!merged(a.row)) v.reasons.push', to: 'if (true) v.reasons.push' },
  { check: 'a hotspot an open PR holds holds the row', file: 'plan.ts', from: '.filter(([f]) => f === h ||', to: '.filter(([f]) => false ||' },
  { check: 'merged rows leave Auto', file: 'plan.ts', from: '.map(normRow).filter((r) => !mergedRow(r))', to: '.map(normRow)' },
  { check: 'a live claim holds its row', file: 'plan.ts', from: "if (c && state.kind !== 'open') v.reasons.push", to: 'if (false) v.reasons.push' },
  // The Board's three defects.
  { check: 'defect 1: rows are built from parsed cells', file: 'board.ts', from: 'lines.push(`| ${cell(r.id)} | ${cell(issue)} |', to: "lines.push(`| ${r.rawLine.split('|')[1].trim()} | ${cell(issue)} |" },
  { check: 'a row with no PR number renders a parsable line', file: 'board.ts', from: "${/^(PM|parked)$/.test(r.cell) ? r.cell : '—'}", to: "${cell(r.cell || '—')}" },
  { check: 'defect 3: a merged PR on a path carries ✓', file: 'board.ts', from: '(merged(normRow(id)) ? `${tok} ✓` : tok)', to: '(false ? `${tok} ✓` : tok)' },
  { check: 'the parse refuses "waiting on" a merged PR', file: 'board.ts', from: 'if (w && facts.merged.has(normRow(w[1])))', to: 'if (false)' },
  { check: 'the parse refuses a merged PR with no ✓', file: 'board.ts', from: 'if (facts.merged.has(id) && !m[2])', to: 'if (false)' },
  { check: 'the parse refuses a link tag', file: 'board.ts', from: 'if (/<\\/?(issue|pull-request)\\b/.test(text))', to: 'if (false)' },
  { check: 'the parse refuses a stamp ahead of the clock', file: 'board.ts', from: '> new Date(facts.now).getTime() + 60_000) errors.push(`the stamp', to: '> new Date(facts.now).getTime() + 86_400_000) errors.push(`the stamp' },
  { check: 'the parse refuses a malformed line', file: 'board.ts', from: "if (cells.length !== 3 || !l.endsWith('|'))", to: 'if (false)' },
  // Validation on write and memory.
  { check: 'a launch line needs a session id', file: 'status.ts', from: 'if (!l.session) errors.push', to: 'if (false) errors.push' },
  { check: 'a launch line needs a branch', file: 'status.ts', from: 'if (!l.branch) errors.push', to: 'if (false) errors.push' },
  { check: 'a timestamp ahead of the clock is refused', file: 'status.ts', from: 'if (new Date(t).getTime() > now + 60_000)', to: 'if (false)' },
  { check: 'an Auto row that merged is refused', file: 'status.ts', from: "if (facts.mergedRows.has(r)) errors.push(`Auto:", to: "if (false) errors.push(`Auto:" },
  { check: 'the check-in is read from the routines', file: 'status.ts', from: '.filter((x) => (x.prompt ?? x.message ??', to: '.filter((x) => true || (x.prompt ?? x.message ??' },
  { check: 'memory names a launch never recorded', file: 'status.ts', from: 'if (!known.has(b)) {', to: 'if (false) {' },
  { check: 'memory names a merged Auto row', file: 'status.ts', from: 'if (n) out.push(`Auto: still names', to: 'if (false) out.push(`Auto: still names' },
  { check: 'an issue id never reaches a PR body whole', file: 'status.ts', from: '(keep.includes(m.toUpperCase()) ? m : `${k}\\u2011${n}`)', to: '(keep.includes(m.toUpperCase()) ? m : m)' },
  // A child idle on a green PR (CUL-1623, #1084).
  { check: 'a required check that has not reported is pending', file: 'stall.ts', from: "if (required.some((n) => !names.has(n))) return { state: 'pending' };", to: '' },
  { check: 'one failed run is red', file: 'stall.ts', from: "if (runs.some((r) => r.status === 'completed' && r.conclusion && !PASS.has(r.conclusion))) return { state: 'failure' };", to: '' },
  { check: 'green is dated by the last completion', file: 'stall.ts', from: 'new Date(Math.max(...times))', to: 'new Date(Math.min(...times))' },
  { check: 'a queued, running or undated run is pending', file: 'stall.ts', from: "if (times.some((t) => Number.isNaN(t))) return { state: 'pending' };", to: '' },
  { check: 'a working session is not stalled', file: 'stall.ts', from: "const IDLE: SessionBucket[] = ['review_ready', 'blocked', 'completed'];", to: "const IDLE: SessionBucket[] = ['review_ready', 'blocked', 'completed', 'working'];" },
  { check: 'a dead session is not stalled', file: 'stall.ts', from: "input.sessions[session] ?? 'gone'", to: "input.sessions[session] ?? 'review_ready'" },
  { check: 'a parked PR is not stalled', file: 'stall.ts', from: ' || input.parked.includes(pr.number)) continue;', to: ') continue;' },
  { check: 'a PR not mergeable is not stalled', file: 'stall.ts', from: ' || pr.mergeable !== true', to: '' },
  { check: 'the grace keeps a subscription wake unraced', file: 'stall.ts', from: 'if (now - ms(pr.checks.doneAt) < STALL_GRACE_MIN * 60_000) continue;', to: '' },
  { check: 'idle with CI running is a ci-wait', file: 'stall.ts', from: "if (pr.checks?.state === 'pending') {", to: 'if (false) {' },
  { check: 'one head is noted once', file: 'stall.ts', from: '&& n.sha === pr.headSha);', to: '&& false);' },
  { check: 'no head sha, no note', file: 'stall.ts', from: ' || !pr.headSha) continue;', to: ') continue;' },
  { check: 'the CI-wait reason is exact', file: 'stall.ts', from: '/^waiting on CI\\.?$/i', to: '/waiting on CI/i' },
  { check: 'a terminal wake ends it', file: 'stall.ts', from: "if (last.kind !== 'stopped') return true;", to: "if (last.kind !== 'stopped') return false;" },
  { check: 'a CI-wait stop never holds', file: 'stall.ts', from: "if (CI_WAIT.test((last.reason ?? '').trim())) return false;", to: '' },
  { check: 'a push after a stop ends the stop', file: 'stall.ts', from: 'return !(pr.lastCommitAt && ms(pr.lastCommitAt) > ms(last.at));', to: 'return true;' },
  { check: 'another project\'s launch is not this dispatcher\'s', file: 'stall.ts', from: 'l.project === input.alias && ', to: '' },
  // The reader.
  { check: 'the Board is never read back as plan', file: 'page.ts', from: 'const plain = stripTags(withoutBoard(rawLines).join', to: 'const plain = stripTags(rawLines.join' },
  { check: 'a merge gate reads past the dots in a version', file: 'page.ts', from: '/Merge gate:\\s*(.*?)(?:\\.(?=\\s|$)|$)/', to: '/Merge gate:\\s*([^.]*)/' },
  { check: 'Linear escapes are undone before a title match', file: 'page.ts', from: 'out.shippedTitle = unescapeMd(stripTags(tagTitle).trim())', to: 'out.shippedTitle = stripTags(tagTitle).trim()' },
  // The progress update (CUL-1624).
  { check: 'a cycle is a launch matched to its merged PR by branch', file: 'progress.ts', from: "p.state === 'merged' && p.mergedAt && p.headRef === l.branch", to: "p.state === 'merged' && p.mergedAt" },
  { check: 'one cycle per PR', file: 'progress.ts', from: 'if (!pr || seen.has(pr.number)) continue;', to: 'if (!pr) continue;' },
  { check: 'the window starts at the newest progress update', file: 'progress.ts', from: '.filter((u) => u.body.trimStart().startsWith(PROGRESS_HEAD))', to: '' },
  { check: 'moved counts only the window', file: 'progress.ts', from: 'const inWindow = (t?: string) => !!t && ms(t) >= since && ms(t) <= now;', to: 'const inWindow = (t?: string) => !!t;' },
  { check: 'a parent is never counted beside its children', file: 'progress.ts', from: '|| parents.has(i.id)) continue;', to: ') continue;' },
  { check: 'a canceled issue is not counted', file: 'progress.ts', from: "if (i.stateType === 'canceled' || ", to: 'if (' },
  { check: "the PM's label beats the launch it stopped on", file: 'progress.ts', from: "else if (i.labels?.includes(PM_LABEL)) out.push({ id: i.id, wave, state: 'on-you' });", to: '' },
  { check: 'a launched issue is running', file: 'progress.ts', from: 'else if (branches.length) out.push', to: 'else if (false) out.push' },
  { check: 'a row held on a ruling is on you', file: 'progress.ts', from: "if (v.holds.some((h) => h.kind === 'pm' || h.kind === 'ruling' || h.kind === 'waits'))", to: 'if (false)' },
  { check: 'next names a row waiting only on unmerged PRs', file: 'progress.ts', from: 'if (deps.every(Boolean))', to: 'if (false)' },
  { check: 'the bar never rounds up to done', file: 'progress.ts', from: 'Math.floor((done / total) * width)', to: 'Math.round((done / total) * width)' },
  { check: 'a wave prints its short name', file: 'progress.ts', from: "w.split(' · ')[0] || 'no wave'", to: "w || 'no wave'" },
  { check: 'the median interpolates', file: 'progress.ts', from: '(h - lo) * (', to: '0 * (' },
  { check: 'rows waiting on the PM are never estimated', file: 'progress.ts', from: "['running', 'open', 'ready', 'held'].includes(u.state)", to: "['running', 'open', 'ready', 'held', 'on-you'].includes(u.state)" },
  { check: 'rounds round up', file: 'progress.ts', from: 'Math.ceil(runnable / slots)', to: 'Math.floor(runnable / slots)' },
  { check: 'no free slot counts as one', file: 'progress.ts', from: 'Math.max(1, input.slots)', to: 'input.slots' },
  { check: 'too few cycles here falls back to the repo', file: 'progress.ts', from: '    pool = input.repoCycles!;\n', to: '' },
  { check: 'too few cycles anywhere is no estimate', file: 'progress.ts', from: 'if (pool.length < MIN_CYCLES) return', to: 'if (false) return' },
  { check: 'the update is six lines', file: 'progress.ts', from: 'if (lines.length !== LABELS.length)', to: 'if (false)' },
  { check: 'the update carries no link tag', file: 'progress.ts', from: "if (/<\\/?(issue|pull-request)\\b/.test(text)) errors.push('a link tag", to: "if (false) errors.push('a link tag" },
  { check: 'the email needs the owner address', file: 'progress.ts', from: 'if (!owner || !ADDRESS.test(owner.trim())) return', to: 'if (!owner) return' },
  { check: 'the email goes to one address, never a list', file: 'progress.ts', from: 'const ADDRESS = /^[^\\s@,;<>]+@[^\\s@,;<>]+\\.[^\\s@,;<>]+$/;', to: 'const ADDRESS = /^.+@.+\\..+$/;' },
  { check: 'the email carries the six lines and nothing else', file: 'progress.ts', from: 'if (errors.length) return { skipped:', to: 'if (false) return { skipped:' },
  // The sort (CUL-1872): the harm read, the dark proof, the doors, the writes.
  { check: 'population: the project window starts 10-03', file: 'sort.ts', from: 'if (c.inProject && ms(c.createdAt) >= ms(V12_START)) return true;', to: 'if (c.inProject) return true;' },
  { check: 'population: team-wide Live harm and Gate: at any date', file: 'sort.ts', from: '  if (hasLabel(c.labels, LIVE_HARM) || hasGate(c.labels)) return true;\n', to: '' },
  { check: 'population: the team-wide Direction / relatedTo read starts 10-11', file: 'sort.ts', from: 'return ms(c.createdAt) >= ms(SORT_START) && (', to: 'return (' },
  { check: 'population: a closed issue is never read', file: 'sort.ts', from: '  if (!c.open) return false;\n', to: '' },
  { check: 'a Live harm or Gate: label is harm whatever the tag', file: 'sort.ts', from: 's.harm = labelled || ', to: 's.harm = ' },
  { check: 'an empty quote is no reading', file: 'sort.ts', from: '!!c.reading && c.reading.quote.trim().length > 0', to: '!!c.reading' },
  { check: 'dark needs enabled: false ({enabled:true, allowlist:[]} is live)', file: 'sort.ts', from: 'return o.enabled === false && Array.isArray(o.allowlist) && o.allowlist.length === 0;', to: 'return Array.isArray(o.allowlist) && o.allowlist.length === 0;' },
  { check: 'dark needs the allowlist present and empty', file: 'sort.ts', from: 'return o.enabled === false && Array.isArray(o.allowlist) && o.allowlist.length === 0;', to: 'return o.enabled === false && (!Array.isArray(o.allowlist) || o.allowlist.length === 0);' },
  { check: 'no key named is live', file: 'sort.ts', from: "  if (!keys.length) why.push('no app_config key identified');\n", to: '' },
  { check: 'a named live surface is live', file: 'sort.ts', from: 'for (const s of c.liveSurfaces ?? []) why.push(', to: 'for (const s of [] as string[]) why.push(' },
  { check: 'an applied migration is live', file: 'sort.ts', from: 'else if (applied.has(k)) why.push(', to: 'else if (false) why.push(' },
  { check: 'a migration on main is live', file: 'sort.ts', from: 'else if (onMain.has(k)) why.push(', to: 'else if (false) why.push(' },
  { check: 'an unread applied list is live', file: 'sort.ts', from: 'if (!applied) why.push(`migration ${m}: the applied list was not read`);', to: 'if (!applied) continue;' },
  { check: 'a key with no go-live cannot gate', file: 'sort.ts', from: 'const missingGoLive = (c.keys ?? []).filter((k) => !input.goLives?.[k])', to: 'const missingGoLive = (c.keys ?? []).filter((k) => false)' },
  { check: 'a closed go-live cannot gate', file: 'sort.ts', from: 'return !st || /^(Done|Canceled|Cancelled|Duplicate)$/i.test(st);', to: 'return false;' },
  { check: 'door 2 needs a blocks relation to every go-live', file: 'sort.ts', from: '.filter((g): g is string => !!g && !(c.blocks ?? []).includes(g))', to: '.filter((g): g is string => false)' },
  { check: 'door 1 adds Live harm', file: 'sort.ts', from: 'if (!hasLabel(c.labels, LIVE_HARM)) writes.push(', to: 'if (false) writes.push(' },
  { check: 'a claimed fix is not flagged unclaimed', file: 'sort.ts', from: 'const unclaimed = !input.claimed.has(c.id) && now - ms(c.createdAt) >= DAY;', to: 'const unclaimed = now - ms(c.createdAt) >= DAY;' },
  { check: 'unclaimed means 24 hours', file: 'sort.ts', from: 'const unclaimed = !input.claimed.has(c.id) && now - ms(c.createdAt) >= DAY;', to: 'const unclaimed = !input.claimed.has(c.id);' },
  { check: 'door 2 removes Live harm', file: 'sort.ts', from: 'if (hasLabel(c.labels, LIVE_HARM)) writes.push(', to: 'if (false) writes.push(' },
  { check: 'door 2 adds its Gate: label', file: 'sort.ts', from: 'if (!hasGate(c.labels)) {', to: 'if (false) {' },
  { check: 'a privacy harm gates as Gate: privacy', file: 'sort.ts', from: "const g = c.harm === 'exposure' || c.harm === 'loss' ? 'Gate: privacy' : 'Gate: clinical';", to: "const g = 'Gate: clinical';" },
  { check: 'only neither reaches door 3', file: 'sort.ts', from: "const row = tag === 'neither' ? (c.blocks", to: "const row = tag !== 'QUIET' ? (c.blocks" },
  { check: 'door 3 needs an on-path row', file: 'sort.ts', from: 'return row.split(\' + \').map(normRow).some((p) => onPath.has(p)) ? row : undefined;', to: 'return row;' },
  { check: 'door 3 needs an unmerged row', file: 'sort.ts', from: "if (!row || input.rowState(row) === 'merged') return undefined;", to: 'if (!row) return undefined;' },
  { check: 'Waiting on PM suppresses the door-3 offer', file: 'sort.ts', from: ' || hasLabel(c.labels, WAITING_ON_PM) || c.id === input.index', to: ' || c.id === input.index' },
  { check: 'a page naming the issue covers it', file: 'sort.ts', from: 'new RegExp(`\\\\b${c.id}\\\\b`).test(input.page.plain) || !!c.skipped', to: '!!c.skipped' },
  { check: 'unlink lists a parent as well as blocks', file: 'sort.ts', from: 'const unlinkOf = (c: Candidate) => [...(c.parentId ? [c.parentId] : []), ...(c.blocks ?? [])];', to: 'const unlinkOf = (c: Candidate) => [...(c.blocks ?? [])];' },
  { check: 'a leak stopgap switches the path off', file: 'sort.ts', from: "return harm === 'exposure' || harm === 'loss'\n    ? 'if the fix", to: "return false\n    ? 'if the fix" },
  { check: 'the digest counts only what was filed since the last run', file: 'sort.ts', from: '(created.get(s.id) ?? 0) > since', to: 'true' },
  // The two alarms (CUL-1872).
  { check: 'the forecast alarm fires at forecast + 1', file: 'alarms.ts', from: 'if (count < forecast + 1) continue;', to: 'if (count < forecast + 2) continue;' },
  { check: 'the forecast alarm does not fire at the forecast', file: 'alarms.ts', from: 'if (count < forecast + 1) continue;', to: 'if (count < forecast) continue;' },
  { check: 'an alarm holds only unlaunched rows', file: 'alarms.ts', from: "input.rowState(r.id) === 'unlaunched' && ", to: '' },
  { check: 'an alarm never holds a Live harm row', file: 'alarms.ts', from: ' && !r.issues.some((i) => input.liveHarm.has(i))', to: '' },
  { check: 'the follow-up alarm fires at the third', file: 'alarms.ts', from: 'if (ups.length < FOLLOW_UP_LIMIT) continue;', to: 'if (ups.length < FOLLOW_UP_LIMIT - 1) continue;' },
  { check: 'a row under a forecast is never follow-up counted', file: 'alarms.ts', from: '    if (forecastRoot.has(r.id)) continue; // a forecast root counts it instead\n', to: '' },
  { check: 'an alarm holds the verdicts it names', file: 'plan.ts', from: '    for (const r of a.holdsRows) verdicts.find((v) => v.row === r)?.reasons.push(a.reason);\n', to: '' },
  // The cost and scope lines, and the path (CUL-1872).
  { check: 'only on-path rows are recommended', file: 'plan.ts', from: 'recommended: proposal.filter((r) => verdicts.find((v) => v.row === r)!.onPath),', to: 'recommended: proposal,' },
  { check: 'an off-path row is never auto', file: 'plan.ts', from: 'autoConfirmed: onPath && row.auto', to: 'autoConfirmed: row.auto' },
  { check: 'auto counts only when confirmed', file: 'plan.ts', from: ' && confirmedAuto.has(normRow(row.id))', to: '' },
  { check: 'a plan-gated row asks a plan go', file: 'plan.ts', from: "if (gate.line === 'plan') parts.push(", to: 'if (false) parts.push(' },
  // PR-31 (CUL-2887) and CUL-2912: post and proceed; a migration row keeps its plan go.
  { check: 'a migration row is plan-gated', file: 'plan.ts', from: "if (row.migration) planGated.push('migration');", to: '' },
  { check: 'the line follows planGated', file: 'plan.ts', from: "const line = planGated.length ? 'plan' : 'routine';", to: "const line = planGated.length && !row.migration ? 'plan' : 'routine';" },
  { check: 'a migration row asks its plan go', file: 'plan.ts', from: "if (gate.line === 'plan') parts.push(", to: "if (gate.line === 'plan' && !gate.migration) parts.push(" },
  { check: 'every issue on the row is read', file: 'plan.ts', from: 'const facts = row.issues.map((i) => input.issues[i]);', to: 'const facts = row.issues.slice(0, 1).map((i) => input.issues[i]);' },
  { check: 'a production merge asks a merge', file: 'plan.ts', from: 'if (PRODUCTION_MERGE.test(t) ||', to: 'if (false ||' },
  { check: 'a pending ruling asks one', file: 'plan.ts', from: 'for (let i = 0; i < opts.rulings; i++)', to: 'for (let i = 0; i < 0; i++)' },
  { check: 'the Done means line is read', file: 'page.ts', from: 'doneMeans: parseDoneMeans(plain),', to: 'doneMeans: undefined,' },
  { check: 'scope: planned is the Done means rows', file: 'progress.ts', from: 'planned: plan.page.doneMeans ? plan.page.doneMeans.length : null,', to: 'planned: plan.page.rows.length,' },
  { check: 'scope: added counts only this week', file: 'progress.ts', from: 'ms(now) - ms(createdAt[r.issues[0]]!) <= WEEK', to: 'true' },
  // Adversarial pass 1 (CUL-1872) and the anchors the fixes moved.
  { check: 'Directions and Direction of are prose, never a tag', file: 'sort.ts', from: "const DIRECTION = /\\bDirection\\b[*_`\\s]*[:|]", to: "const DIRECTION = /Direction[*_`\\s]*[:|]?" },
  { check: 'quiet anywhere in a tagged issue is QUIET (the worst instance wins, in any order)', file: 'sort.ts', from: "  if (/\\bquiet/i.test(description)) return 'QUIET';\n", to: '' },
  { check: 'an unreadable tag value is no tag', file: 'sort.ts', from: "    if (!l && !/\\bneither\\b/i.test(v)) return undefined;\n", to: '' },
  { check: 'untagged counts as QUIET', file: 'sort.ts', from: "s.harm = labelled || tag === 'QUIET' || (!tag && !readAway) || c.harm !== undefined;", to: "s.harm = labelled || tag === 'QUIET' || c.harm !== undefined;" },
  { check: 'a finding that can expose, lose or corrupt is harm whatever its tag', file: 'sort.ts', from: " || (!tag && !readAway) || c.harm !== undefined;", to: " || (!tag && !readAway);" },
  { check: 'only clinical and privacy gates are harm labels', file: 'sort.ts', from: 'const hasGate = (labels: string[]) => HARM_GATES.some((g) => hasLabel(labels, g));', to: 'const hasGate = (labels: string[]) => labels.some((l) => /^gate:/i.test(l));' },
  { check: 'a kill switch under the object shape is live', file: 'sort.ts', from: 'if (!allowlistRead || !value ||', to: 'if (!value ||' },
  { check: 'off-arm code is live', file: 'sort.ts', from: "if (c.arm === 'off' || c.arm === 'both') why.push(", to: 'if (false) why.push(' },
  { check: 'an unstated arm is live', file: 'sort.ts', from: "else if (c.arm !== 'on') why.push(", to: 'else if (false) why.push(' },
  { check: 'a failed production read is live', file: 'sort.ts', from: "if (!ctx.appConfig) why.push('the production app_config read failed or was not taken');\n  else", to: 'if (!ctx.appConfig) {} else' },
  { check: 'a key missing from production is live, and says so', file: 'sort.ts', from: 'if (!Object.prototype.hasOwnProperty.call(ctx.appConfig, k)) why.push(', to: 'if (false) why.push(' },
  { check: 'a trigger, policy or unmatched name is live', file: 'sort.ts', from: 'else if (!unmerged.has(k)) why.push(', to: 'else if (false) why.push(' },
  { check: 'migration names normalise (095a_, hyphens)', file: 'sort.ts', from: ".replace(/^\\d+[a-z]?_/, '').replace(/-/g, '_')", to: ".replace(/^\\d+_/, '')" },
  { check: 'a LOUD finding parks as err loud', file: 'sort.ts', from: "const k: ParkKind = tag === 'LOUD' || c.reading?.kind === 'loud' ? 'err loud'", to: "const k: ParkKind = c.reading?.kind === 'loud' ? 'err loud'" },
  { check: 'follow-ups count only the last seven days', file: 'alarms.ts', from: '(f) => !own.has(f.id) && now - ms(f.createdAt) <= window && ', to: '(f) => !own.has(f.id) && ' },
  { check: 'a child and a blocks relation are follow-ups', file: 'alarms.ts', from: '(touches(f.parentId ? [f.parentId] : []) || touches(f.blocks) || touches(f.relatedTo))', to: '(touches(f.relatedTo))' },
  { check: "every one of a row's issues takes follow-ups", file: 'alarms.ts', from: 'const own = new Set([...r.issues, ', to: 'const own = new Set([r.issues[0], ' },
  { check: 'output on means a stopgap', file: 'alarms.ts', from: "return why.length ? { stopgap: true,", to: "return false ? { stopgap: true," },
  { check: 'an unreadable forecast alarms at once', file: 'alarms.ts', from: "const forecast = read === 'unreadable' ? 0 : read;", to: "if (read === 'unreadable') continue;\n    const forecast = read;" },
  { check: 'a forecast range takes its lower bound', file: 'alarms.ts', from: '(?:\\\\s*(?:-|–|to)\\\\s*(?:${w}))?', to: '' },
  { check: 'a covered door-3 finding counts under its root', file: 'plan.ts', from: "    ...(sort?.sorted ?? []).filter((x) => x.door === 'covered' && x.blocksRow && !rowIssueSet.has(x.id))", to: "    ...(sort?.sorted ?? []).filter((x) => false && x.blocksRow && !rowIssueSet.has(x.id))" },
  { check: 'a follow-up keeps its finding relations over the issue fact', file: 'plan.ts', from: 'byId.set(c.id, { id: c.id, createdAt: c.createdAt, parentId: c.parentId ?? prior?.parentId, blocks: c.blocks, relatedTo: c.relatedTo });', to: 'if (!prior) byId.set(c.id, { id: c.id, createdAt: c.createdAt, parentId: c.parentId, blocks: c.blocks, relatedTo: c.relatedTo });' },
  { check: 'a migration asks an apply', file: 'plan.ts', from: "if (gate.migration) for (let i = 0; i < Math.max(1, files.size); i++) parts.push('apply <NNN>');", to: '' },
  { check: 'one apply per migration file', file: 'plan.ts', from: 'Math.max(1, files.size)', to: '1' },
  { check: 'only a migration in an open PR can be shown unapplied', file: 'plan.ts', from: ".filter((p) => p.state === 'open')\n    .flatMap((p) => migrationsIn(p.files)", to: ".flatMap((p) => migrationsIn(p.files)" },
  // Adversarial pass 2 (CUL-1872).
  { check: 'a Direction tag needs no colon', file: 'sort.ts', from: " || new RegExp(DIRECTION_LOOSE.source, 'i').test(d);", to: ';' },
  { check: 'labels compare case-insensitively', file: 'sort.ts', from: "const labelKey = (l: string) => l.toLowerCase().replace(/\\s+/g, '');", to: 'const labelKey = (l: string) => l;' },
  { check: "a forecast stopgap reads the rows under the root", file: 'alarms.ts', from: 'const s = stopgapFor([root, ...rowFacts], input.liveOf);', to: 'const s = stopgapFor([root], input.liveOf);' },
  { check: "a follow-up stopgap reads every one of the row's issues", file: 'alarms.ts', from: 'const s = stopgapFor(r.issues.map((i) => input.rowOutputs?.[i]), input.liveOf);', to: 'const s = stopgapFor([input.rowOutputs?.[r.issues[0]]], input.liveOf);' },
  // The gate reads the kept list (CUL-2886).
  { check: 'auto needs nothing kept', file: 'plan.ts', from: "g.mode === 'BUILD' && g.kept === 'none' &&", to: "g.mode === 'BUILD' &&" },
  { check: 'the gate passes labels to the kept list', file: 'plan.ts', from: 'keptOf({ labels: issue?.labels ?? [], files:', to: 'keptOf({ labels: [], files:' },
  // pathsIn itself lives in scripts/kept/kept.ts and is proven by scripts/kept/mutants.ts.
  { check: 'the gate reads the paths a note names', file: 'plan.ts', from: 'files: pathsIn(text), text,', to: 'text,' },
  { check: 'taste does not plan-gate a DISCOVERY row', file: 'plan.ts', from: "    if (why.startsWith('taste:') && mode === 'DISCOVERY') continue;\n", to: '' },
  { check: 'taste plan-gates a BUILD row', file: 'plan.ts', from: "if (why.startsWith('taste:') && mode === 'DISCOVERY') continue;", to: "if (why.startsWith('taste:')) continue;" },
  { check: 'the allowlist-read keys include the engine keys', file: 'codeFacts.ts', from: "[...a, ...b]", to: '[...a]' },
  // The likelihood gate (CUL-2123): ahead of the Live harm door, only an explicit rare
  // trigger parks, a leak or loss always passes, and the rule text a child reads says so.
  { check: 'the gate parks a rare trigger ahead of the Live harm door', file: 'sort.ts', from: 'if (rare && !leak) {', to: 'if (false) {' },
  { check: 'a leak or a loss passes the gate', file: 'sort.ts', from: "const leak = c.harm === 'exposure' || c.harm === 'loss' || ", to: 'const leak = ' },
  { check: 'Gate: privacy passes the gate', file: 'sort.ts', from: " || hasLabel(c.labels, 'Gate: privacy');", to: ';' },
  { check: 'any form of regress passes the gate', file: 'sort.ts', from: 'if (/regress/i.test(text) || ', to: 'if (' },
  { check: 'any word for a leak or a loss passes the gate', file: 'sort.ts', from: ' || LEAK_OR_LOSS.test(text) || CLASS', to: ' || CLASS' },
  { check: 'a class always passes the gate', file: 'sort.ts', from: ' || CLASS.test(text)) return undefined;', to: ') return undefined;' },
  { check: 'any other line with trigger in it passes the gate', file: 'sort.ts', from: "    else if (/trigger/i.test(l)) return undefined;\n", to: '' },
  { check: 'trigger is matched as a stem (Triggered, _trigger)', file: 'sort.ts', from: 'else if (/trigger/i.test(l))', to: 'else if (/\\btriggers?\\b/i.test(l))' },
  { check: 'a fenced line is a copy, never its own', file: 'sort.ts', from: 'const clean = fenced ? undefined : CLEAN_RARE', to: 'const clean = CLEAN_RARE' },
  { check: 'a > quote is a copy, never its own', file: 'sort.ts', from: 'const CLEAN_RARE = /^[\\s*_#-]*Trigger', to: 'const CLEAN_RARE = /^[\\s>*_#-]*Trigger' },
  { check: 'the gate reads the title too', file: 'sort.ts', from: 'rareTrigger(`${c.title}\\n${c.description}`)', to: 'rareTrigger(c.description)' },
  { check: 'a regression label passes the gate', file: 'sort.ts', from: ' && !regressLabel ?', to: ' ?' },
  { check: 'a placeholder Ship bar states no bar', file: 'page.ts', from: "return v && !/^(tbd|todo|none|n\\/a|[-—–.?]+)\\.?$/i.test(v) ? v : undefined;", to: 'return v || undefined;' },
  { check: "a clean line names exactly one of the ruling's four causes", file: 'sort.ts', from: '(?:two phones|timing|storage failure|clock skew)', to: '[^)]*' },
  { check: 'a clean line is a line of its own', file: 'sort.ts', from: 'const CLEAN_RARE = /^[\\s*_#-]*Trigger', to: 'const CLEAN_RARE = /Trigger' },
  { check: 'a clean value starts with rare (a negation passes)', file: 'sort.ts', from: ':[*_`]*\\s*(rare\\s*\\(', to: ':[*_`]*.*(rare\\s*\\(' },
  { check: "the gate is this project's only", file: 'sort.ts', from: 'const rare = c.inProject && input.page.shipBar && ', to: 'const rare = input.page.shipBar && ' },
  { check: 'the gate needs a Ship bar line on the page', file: 'sort.ts', from: 'const rare = c.inProject && input.page.shipBar && ', to: 'const rare = c.inProject && ' },
  { check: 'a rare park keeps its go-live blocks', file: 'sort.ts', from: '.filter((t) => !goLiveIds.has(t))', to: '' },
  { check: 'a parked rare finding loses Live harm', file: 'sort.ts', from: 'if (wasLive) writes.push(', to: 'if (false) writes.push(' },
  { check: 'a parked rare finding is offered for unlink', file: 'sort.ts', from: 'if (rareUnlink.length) s.unlink = rareUnlink;', to: '' },
  { check: '1b is scoped to a page with a Ship bar', file: '../../.claude/commands/dispatch.md', from: 'A finding of this project, on a page with a `Ship bar:` line', to: 'A finding' },
  { check: '1b keeps the go-live blocks of a rare park', file: '../../.claude/commands/dispatch.md', from: 'a gate label and go-live `blocks` kept', to: 'a gate label kept' },
  { check: "step 5's block files a rare park uncapped", file: '../../.claude/commands/dispatch.md', from: 'goes under the last bullet, uncapped.', to: 'goes under the last bullet.' },
  { check: 'the digest counts rare parks', file: 'sort.ts', from: "${k('rare') ? `", to: '${false ? `' },
  { check: 'the page reads its Ship bar line', file: 'page.ts', from: '    shipBar: parseShipBar(plain),', to: '    shipBar: undefined,' },
  { check: '§ The sort states the gate ahead of door 1', file: '../../.claude/commands/dispatch.md', from: '**1b · The likelihood gate, ahead of door 1**', to: '**1b · The likelihood gate**' },
  { check: 'the gate keeps the clinical ruling', file: '../../.claude/commands/dispatch.md', from: 'a clinical finding that passes still needs its ruling', to: 'a clinical finding that passes is fixed' },
  { check: "step 5's block carries the gate ahead of Live harm", file: '../../.claude/commands/dispatch.md', from: '   - The likelihood gate, ahead of `Live harm`, only', to: '   - The likelihood gate, only' },
  { check: "step 5's block keeps the clinical ruling", file: '../../.claude/commands/dispatch.md', from: 'clinical one still needs its ruling', to: 'clinical one is fixed' },
  { check: 'the page template carries the Ship bar', file: '../../.claude/commands/dispatch.md', from: '- **`Ship bar:`** one line under Done means', to: '- **Ship bar** under Done means' },
  { check: '/wrap names the gate', file: '../../.claude/commands/wrap.md', from: 'the likelihood gate (§ The sort, 1b)', to: 'the gate' },
  { check: 'the groomer does not re-sort a rare park', file: '../../.claude/skills/backlog-groomer/SKILL.md', from: 'unless its every `Trigger:` line is rare', to: 'unless rare' },
  // The filing precheck (PR-15, CUL-2876): the shield is checked first and every reason holds.
  { check: 'an untagged, null or unreadable direction is shielded', file: 'precheck.ts', from: "if (!SAFE_DIRECTION.has(d)) why.push", to: "if (d === 'quiet') why.push" },
  { check: 'a QUIET finding is shielded', file: 'precheck.ts', from: "if (!SAFE_DIRECTION.has(d)) why.push", to: "if (d === '') why.push" },
  { check: 'a QUIET or untagged bundle item is shielded (CUL-2406)', file: 'precheck.ts', from: 'if (!SAFE_DIRECTION.has(id)) why.push', to: 'if (false) why.push' },
  { check: 'untagged harm is shielded', file: 'precheck.ts', from: "if (f.harm === undefined || f.harm === null) why.push", to: 'if (false) why.push' },
  { check: 'harm is shielded', file: 'precheck.ts', from: "else if (norm(f.harm) !== 'none') why.push", to: 'else if (false) why.push' },
  { check: 'Live harm and Gate labels are shielded, trimmed', file: 'precheck.ts', from: 'if (PROTECTED_LABEL.test(String(l).trim())) why.push', to: 'if (PROTECTED_LABEL.test(String(l))) why.push' },
  { check: 'the words need a readable LOUD or neither tag', file: 'precheck.ts', from: "if (wd !== 'LOUD' && wd !== 'neither') why.push", to: "if (wd === 'QUIET') why.push" },
  { check: 'the words need a Harm line', file: 'precheck.ts', from: "if (!hs.length) why.push", to: 'if (false) why.push' },
  { check: 'every Harm line must say none', file: 'precheck.ts', from: "else if (hs.some((h) => h !== 'none')) why.push", to: "else if (hs[0] !== 'none') why.push" },
  { check: 'words describing a quieter warning shield', file: 'precheck.ts', from: 'if (SOFTEN_THEN_WARNING.test(words) || WARNING_THEN_SOFTEN.test(words)) why.push', to: 'if (false) why.push' },
  { check: 'the shield is checked before any reroute', file: 'precheck.ts', from: 'if (shield.length) {', to: 'if (false) {' },
  { check: 'the category bar is unset until the PM sets it', file: 'precheck.ts', from: 'export const FILING_BAR: number | null = null;', to: 'export const FILING_BAR: number | null = 0.99;' },
  { check: 'on main goes to the standing issue', file: 'precheck.ts', from: "if (onMain(f) || isRare(f)) {", to: 'if (isRare(f)) {' },
  { check: 'a text Origin: diff outranks a field main', file: 'precheck.ts', from: "f.origin === 'main' && !/\\bOrigin\\b", to: "f.origin === 'main' || !/\\bOrigin\\b" },
  { check: 'a diff-caused finding is never fixed', file: 'precheck.ts', from: 'const fixed = onMain(f) && ', to: 'const fixed = ' },
  { check: 'fixed needs every cited line gone', file: 'precheck.ts', from: "cites.every((c) => c.snippet !== '' && !ctx.mainHas!(c.file, c.snippet))", to: "cites.some((c) => c.snippet !== '' && !ctx.mainHas!(c.file, c.snippet))" },
  { check: 'a duplicate needs its shared file or a near-identical title', file: 'precheck.ts', from: '(sameFile && t >= 0.4) || (!otherSurface && t >= 0.8)', to: 't >= 0.4' },
  { check: 'a closed issue absorbs nothing', file: 'precheck.ts', from: 'if (o.state && CLOSED.test(o.state)) continue;', to: '' },
  { check: 'a class is never rare', file: 'precheck.ts', from: '!isClass(f) && (', to: '(' },
  { check: 'no trigger line for a bundle, a class, harm, a leak or a loss', file: 'precheck.ts', from: "if (f.items?.length || isClass(f) || norm(f.harm) !== 'none' || harmValues(words).some((h) => h !== 'none') || NEVER_PARKS.test(words)) return undefined;", to: "if (f.items?.length || isClass(f) || norm(f.harm) !== 'none') return undefined;" },
  { check: 'no trigger line for a bundle', file: 'precheck.ts', from: "if (f.items?.length || isClass(f) || norm(f.harm) !== 'none' ||", to: "if (isClass(f) || norm(f.harm) !== 'none' ||" },
  // Project go (PR-32, CUL-2888): preflight's lists and the go's refusal and confirmation.
  { check: 'go project is refused while a ruling is open', file: 'preflight.ts', from: 'if (pre.open.length) return { ok: false', to: 'if (false) return { ok: false' },
  { check: 'a ruled ruling is no longer open', file: 'preflight.ts', from: 'const open = rulings.filter((r) => !r.ruled);', to: 'const open = rulings;' },
  { check: 'a kept row is a ruling before kickoff', file: 'preflight.ts', from: '    if (k) add(k);', to: '' },
  { check: 'an After ruling is a ruling before kickoff', file: 'preflight.ts', from: "x.kind === 'waits' || ((x.kind === 'ruling'", to: "x.kind === 'waits' || ((false" },
  { check: 'an issue merging is a dependency, not a ruling', file: 'preflight.ts', from: '&& asks.has(x.key))', to: ')' },
  { check: 'every migration is listed as an apply', file: 'preflight.ts', from: '    .filter((r) => r.migration)\n', to: '    .filter((r) => r.migration && false)\n' },
  { check: 'a row with no Done when is unready', file: 'preflight.ts', from: "if (!DONE_WHEN.test(row.note)) why.push", to: 'if (false) why.push' },
  { check: 'a row with no verify line is unready', file: 'preflight.ts', from: "if (!VERIFY.test(row.note)) why.push", to: 'if (false) why.push' },
  { check: 'a hotspot two unordered rows share is unready', file: 'preflight.ts', from: '&& !ordered(row.id, o.id));', to: '&& false);' },
  { check: 'an After edge orders two rows', file: 'preflight.ts', from: "if (a.kind === 'pr') edge(r.id, owner.get(a.row));", to: '' },
  { check: 'a chain rule orders two rows', file: 'preflight.ts', from: "if (rule.kind === 'chain') for (let i = 1;", to: "if (false) for (let i = 1;" },
  { check: 'a design surface needs a ratified round', file: 'preflight.ts', from: 'if (taste.length && !RATIFIED.test(row.note)) why.push', to: 'if (false) why.push' },
  { check: 'a project go confirms only on-path rows', file: 'preflight.ts', from: '    if (!v.onPath) continue;', to: '' },
  { check: 'a project go never confirms a kept row', file: 'preflight.ts', from: "if (!why.length && autoEligible(v.gate)) eligible.push", to: "if (!why.slice(1).length) eligible.push" },
  { check: 'a project go never confirms an unready row', file: 'preflight.ts', from: "if (unreadyRows.has(row.id)) why.push('not agent ready');", to: '' },
  { check: 'the go marks only unmarked rows', file: 'preflight.ts', from: '.filter((r) => !pre.plan.page.rows.find((x) => x.id === r)?.auto)', to: '' },
  { check: 'the Auto: line carries earlier confirmed rows', file: 'preflight.ts', from: '[...new Set([...pre.plan.autoRows, ...pre.eligible])]', to: '[...pre.eligible]' },
  { check: 'the forecast counts go project and every open ruling', file: 'preflight.ts', from: 'const inputs = 1 + open.length +', to: 'const inputs = ' },
  { check: 'the readout counts a merged row asked about as not quiet', file: 'preflight.ts', from: 'const quiet = merged.filter((r) => !asked.has(r));', to: 'const quiet = merged;' },
];

function suiteGreen(): boolean {
  const r = spawnSync('npx', ['jest', '--silent', 'scripts/dispatch/'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0;
}

if (!suiteGreen()) {
  console.error('the suite is red before any mutant: fix it first');
  process.exit(1);
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
const RUN = MUTANTS.filter((m) => !only || m.file === only);
let failed = 0;
for (const m of RUN) {
  const file = path.join(DIR, m.file);
  const original = fs.readFileSync(file, 'utf8');
  const hits = original.split(m.from).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR  ${m.check} (${m.file}: matched ${hits} times)`);
    failed++;
    continue;
  }
  try {
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const green = suiteGreen();
    console.log(`${green ? 'SURVIVED' : 'killed  '}  ${m.check}`);
    if (green) failed++;
  } finally {
    fs.writeFileSync(file, original);
  }
}
console.log(`${RUN.length - failed} of ${RUN.length} mutants killed`);
process.exit(failed ? 1 : 0);
