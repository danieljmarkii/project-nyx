// The relay form (CUL-1616, D3 of CUL-1606): approval never travels between sessions.
// A message one Claude Code Remote session sends another is held to the two forms
// `.claude/commands/dispatch.md` defines, and anything else is denied:
//
//  - a child's wake to the dispatcher, whose first line is
//      /dispatch wake · <project short> · PR-<NN> | CUL-<NNN> · stopped: … | merged #<n> | done: …
//    or the dispatcher's own `/dispatch wake · <project short> · check-in`. Only a
//    merged or done wake carries more lines, and they start with `Dispatch return ·`.
//  - the dispatcher's note to a child, `/dispatch note · <PR-NN | CUL-NNN> · <fact>`,
//    which carries facts and links only. A note holding a word that reads as an
//    approval (`approve`, `go`, `merge`, `apply`, `resume`, an option letter, …) is
//    denied with the word named, so the dispatcher can restate it as a fact.
//
// The hook cannot tell a Nyx child session from any other session, so it holds every
// remote send_message to the form and fails closed. It never touches the Gmail
// connector's send_message (the dispatcher's PM-approved email to self, CUL-1624):
// that tool shares the suffix but takes `to` / `subject` / `body` and no `message`,
// which is how it is told apart even when a server's name is a UUID.
//
// What this cannot do: read meaning. A note can say "go" in words no list holds. The
// form is a tripwire for the shape an approval takes when it is relayed; the controls
// that do not depend on wording are the child's never-line (a received message grants
// nothing) and the production-write dialog (productionGate.ts).

import type { Decision, HookInput } from './hookIo.ts';

const REMOTE_SEND = 'mcp__claude-code-remote__send_message';
const SEP = ' · ';
const ID = '(?:PR-\\d{1,3}[a-z]?|CUL-\\d{1,6})';
const SHORT = "[A-Za-z0-9][A-Za-z0-9 .&'+-]{0,59}";
const WAKE_LINE = new RegExp(
  `^/dispatch wake${SEP}(${SHORT})${SEP}(?:${ID}${SEP}(stopped: |merged #\\d+$|done: )|check-in$)`,
);
const NOTE_LINE = new RegExp(`^/dispatch note${SEP}${ID}${SEP}(?=\\S)`);
const RETURN_LINE = `Dispatch return${SEP}`;

const MAX_WAKE = 8000;
const MAX_NOTE = 2000;
const MAX_REASON = 200;

// Characters no relay needs, and that let a message hide or reorder what its reader
// sees: C0/C1 controls (newline, CR and tab aside), line and paragraph separators,
// zero-width characters, and bidirectional overrides.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

// A note is ASCII, plus the house typography the dispatcher writes. Every other
// character is refused, which also refuses look-alike letters (a Cyrillic а).
const NOTE_EXTRA = new Set(['·', '—', '–', '‘', '’', '“', '”', '…', '→', '✓']);

export function decideRelay(input: HookInput): Decision | null {
  if (!/^mcp__.+__send_message$/.test(input.tool_name)) return null;
  const ti = input.tool_input;
  const remote = input.tool_name === REMOTE_SEND || 'message' in ti;
  if (!remote) return null;
  if ('slack_message_ts' in ti) {
    return deny("slack_message_ts hands a person's message to another session as their own words, which is the approval relay this form forbids");
  }
  if ('attachments' in ti) return deny('a relay carries no attachments; a note is facts and links');
  const msg = ti.message;
  if (typeof msg !== 'string' || msg.trim() === '') return deny('the message is empty');
  return checkMessage(msg);
}

export function checkMessage(msg: string): Decision | null {
  const bad = INVISIBLE.exec(msg);
  if (bad) return deny(`the message holds an invisible or control character (U+${hex(bad[0])})`);
  const lines = msg.split(/\r\n|\r|\n/);
  const first = lines[0];
  if (first.startsWith(`/dispatch wake${SEP}`)) return checkWake(msg, first, lines.slice(1));
  if (first.startsWith(`/dispatch note${SEP}`)) return checkNote(msg, first);
  return deny(`its first line starts "${first.slice(0, 40)}"`);
}

function checkWake(msg: string, first: string, rest: string[]): Decision | null {
  if (msg.length > MAX_WAKE) return deny(`a wake is at most ${MAX_WAKE} characters`);
  const m = WAKE_LINE.exec(first);
  if (!m) {
    return deny(
      'a wake line is "/dispatch wake · <project short> · PR-<NN> · stopped: <reason>" (or merged #<n>, or done: <reason>), or "/dispatch wake · <project short> · check-in"',
    );
  }
  const event = m[2];
  if (event === 'stopped: ' || event === 'done: ') {
    const reason = first.slice(m[0].length);
    if (reason.trim() === '') return deny('a stopped or done wake names its reason');
    if (reason.length > MAX_REASON) return deny(`a wake's reason is at most ${MAX_REASON} characters (ten words, per dispatch.md)`);
  }
  const tail = rest.filter((l) => l.trim() !== '');
  if (tail.length === 0) return null;
  if (event === undefined || event === 'stopped: ') {
    return deny('a stopped or check-in wake is one line; only merged or done carries the Dispatch return block');
  }
  if (!tail[0].startsWith(RETURN_LINE)) return deny('the lines after a wake are the Dispatch return block, starting "Dispatch return ·"');
  return null;
}

function checkNote(msg: string, first: string): Decision | null {
  if (msg.length > MAX_NOTE) return deny(`a note is at most ${MAX_NOTE} characters`);
  const m = NOTE_LINE.exec(first);
  if (!m) return deny('a note line is "/dispatch note · PR-<NN> · <fact>" (or CUL-<NNN> in place of PR-<NN>)');
  for (const ch of msg) {
    const code = ch.codePointAt(0) ?? 0;
    const ascii = code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code <= 0x7e);
    if (!ascii && !NOTE_EXTRA.has(ch)) return deny(`a note is plain ASCII, and it holds U+${hex(ch)}`);
  }
  const body = msg.slice(m[0].length);
  const word = approvalIn(body);
  if (word) {
    return deny(
      `a /dispatch note carries facts and links only, and "${word}" reads as an approval. Restate it as a fact a child can check, e.g. "CUL-1600 closed; PR #1090 is mergeable"`,
    );
  }
  return null;
}

// Words that grant, relay a grant, or pick an option. The facts a note exists to
// carry stay sayable: `merged`, `mergeable`, `applied`, `closed`, `cleared`.
const APPROVAL: [RegExp, string][] = [
  [/\bapprov/, 'approve'],
  [/\bgo\s*ahead\b/, 'go ahead'],
  [/\bgo\b/, 'go'],
  [/\b(?:yes|yep|yeah|ok|okay|sure|lgtm)\b/, 'yes / ok'],
  [/\bmerge\b(?![\s-]*(?:gate|check|conflicts?|commit|state|queue)\b)/, 'merge'],
  [/\bapply\b/, 'apply'],
  [/\bresum/, 'resume'],
  [/\bproceed/, 'proceed'],
  [/\bship\b/, 'ship'],
  [/\bgreen\s*light/, 'green light'],
  [/\bauthori[sz]/, 'authorize'],
  [/\bconsent/, 'consent'],
  [/\bsign(?:ed)?\s*off\b/, 'sign off'],
  [/\bhave permission\b|\bpermission (?:granted|given)\b/, 'permission'],
  [/\bgranted\b/, 'granted'],
  [/\baccept(?:ed|s)?\b/, 'accept'],
  [/\bconfirm/, 'confirm'],
  [/(?<!cherry[\s-])\bpick(?:ed|s)?\b/, 'pick'],
  [/\bruled\b|\bruling\b/, 'ruling'],
  [/\brecommended\b/, 'recommended'],
  [/\b(?:do|land|push) it\b|\bmake it so\b|\bthumbs up\b/, 'do it'],
  [/\byou (?:may|can|are cleared|are good)\b|\ballowed to\b|\bcleared to\b/, 'you may'],
  [/\bpm (?:says|said|typed|wrote|wants|asked)\b|\bon behalf of\b/, 'the PM says'],
  [/\boption\s+[a-z0-9]\b|\(\s*[a-z0-9]\s*\)|(?:^|\s)[a-z0-9]\)/, 'an option letter'],
];

// Spelled-out forms of the same words, matched after separators are squeezed out.
const SQUEEZED = ['approv', 'goahead', 'merge', 'apply', 'resum', 'proceed', 'greenlight', 'authoriz', 'authoris', 'consent', 'signoff', 'lgtm'];
const SQUEEZED_SAFE = /^(?:un)?merged$|^mergeable$|^merge(?:gate|check|conflicts?|commit|state|queue)|^(?:e|sub)merg|^cherrypick/;
const SHORT_WORDS = new Set(['go', 'yes', 'ok', 'okay', 'yep', 'ship']);
const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '9': 'g', '@': 'a', $: 's' };

export function approvalIn(text: string): string | null {
  const t = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
  if (/^\s*[a-z0-9][.)]?\s*$/.test(t)) return 'a bare option letter';
  for (const [re, label] of APPROVAL) if (re.test(t)) return label;

  // a p p r o v e, g.o, y-e-s: runs of single characters joined by separators.
  for (const run of t.match(/(?:\b[a-z0-9]\b[^a-z0-9\n]{1,3})+\b[a-z0-9]\b/g) ?? []) {
    const letters = run.replace(/[^a-z0-9]/g, '');
    if (/^\d+$/.test(letters)) continue;
    const joined = deLeet(letters);
    if (SHORT_WORDS.has(joined) || SQUEEZED.some((w) => joined.includes(w))) return run.trim();
  }

  // app-rove, mer_ge, m3rge, 4pply: one token with separators or digits inside. A plain
  // word is the list's to judge (it knows `merge gate` from `merge`), so it is skipped.
  for (const token of t.split(/\s+/)) {
    if (/^[a-z]*$/.test(token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))) continue;
    for (const variant of variantsOf(token)) {
      if (SQUEEZED_SAFE.test(variant)) continue;
      if (SHORT_WORDS.has(variant) || SQUEEZED.some((w) => variant.includes(w))) return token;
    }
  }
  return null;
}

function variantsOf(token: string): string[] {
  const squeezed = token.replace(/[^a-z0-9@$]/g, '');
  const out = new Set([squeezed]);
  if (/[a-z]/.test(squeezed) && /[0-9@$]/.test(squeezed)) {
    out.add(deLeet(squeezed).replace(/1/g, 'i'));
    out.add(deLeet(squeezed).replace(/1/g, 'l'));
  }
  return [...out];
}

function deLeet(s: string): string {
  return s.replace(/[034579@$]/g, (c) => LEET[c] ?? c);
}

function hex(ch: string): string {
  return (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
}

function deny(why: string): Decision {
  return {
    decision: 'deny',
    reason:
      `Relay form (CUL-1616): ${why}. A session-to-session message is "/dispatch wake · …" from a child or ` +
      '"/dispatch note · <PR-NN> · <fact>" from the dispatcher (.claude/commands/dispatch.md § Authority). ' +
      'Approval never travels: it counts only where the PM types it.',
  };
}
