// The deploy ledger, as the deploy workflow reads it (CUL-1147).
//
// `supabase/functions/deploy-manifest.json` used to carry a `deployed` / `pending` /
// `hold` status and a fingerprint for EVERY function, and a PR author had to update
// it whenever a function's shipping code moved. Merging now deploys, and the deploy
// workflow records each deploy itself (GitHub deployment records, see records.ts), so
// the file keeps only the two things a person decides:
//
//   order  the functions that must deploy in a fixed sequence when several deploy in
//          one run (analyze-vomit, then analyze-stool, then ask: ask's live photo
//          reads route through the two analyze functions).
//   holds  functions that must NOT go live on merge yet, each naming the issue that
//          gates it and the fingerprint of the code being held. A change to a held
//          function's code reds the guard until that fingerprint is updated, so a
//          change never joins a held queue without its author knowing.
//
// Pure: no filesystem, no network. The guard and the CLI both read the file and
// hand the parsed JSON here.

export const LEDGER_REL = 'supabase/functions/deploy-manifest.json';

export type Hold = {
  ref: string;
  reason: string;
  fingerprint: string;
  since?: string;
};

export type Ledger = {
  order: string[];
  holds: Record<string, Hold>;
};

const ISSUE_REF = /^CUL-\d+$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOLD_KEYS = new Set(['ref', 'reason', 'fingerprint', 'since']);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Shape problems only. Whether a hold or order entry names a real function, and
// whether a held fingerprint is current, needs the repo, so `ledgerProblems` does it.
export function parseLedger(raw: unknown): { ledger: Ledger; problems: string[] } {
  const problems: string[] = [];
  const ledger: Ledger = { order: [], holds: {} };
  if (!isRecord(raw)) return { ledger, problems: [`INVALID: ${LEDGER_REL} is not a JSON object.`] };

  for (const key of Object.keys(raw)) {
    if (key.startsWith('_') || key === 'order' || key === 'holds') continue;
    if (key === 'functions') {
      problems.push(
        `INVALID: ${LEDGER_REL} still has a "functions" block. The per-function deployed / pending ledger ` +
          `was retired by CUL-1147: merging to main deploys, and the deploy workflow records each deploy. ` +
          `Keep only "order" and "holds".`,
      );
    } else {
      problems.push(`INVALID: unknown key "${key}" in ${LEDGER_REL}. The file holds only "order" and "holds".`);
    }
  }

  if (raw.order !== undefined) {
    if (!Array.isArray(raw.order) || raw.order.some((f) => typeof f !== 'string')) {
      problems.push(`INVALID: "order" must be an array of function names.`);
    } else {
      const seen = new Set<string>();
      for (const fn of raw.order as string[]) {
        if (seen.has(fn)) problems.push(`INVALID: "${fn}" appears twice in "order".`);
        seen.add(fn);
      }
      ledger.order = [...seen];
    }
  }

  if (raw.holds !== undefined) {
    if (!isRecord(raw.holds)) {
      problems.push(`INVALID: "holds" must be an object keyed by function name.`);
    } else {
      for (const [fn, value] of Object.entries(raw.holds)) {
        if (!isRecord(value)) {
          problems.push(`INVALID: holds.${fn} must be an object with "ref", "reason" and "fingerprint".`);
          continue;
        }
        for (const key of Object.keys(value)) {
          if (!HOLD_KEYS.has(key)) problems.push(`INVALID: unknown key "${key}" in holds.${fn}.`);
        }
        const { ref, reason, fingerprint, since } = value;
        if (typeof ref !== 'string' || !ISSUE_REF.test(ref)) {
          problems.push(`UNREASONED: holds.${fn} needs "ref": the CUL issue that gates it (e.g. "CUL-215").`);
        }
        if (typeof reason !== 'string' || !reason.trim()) {
          problems.push(`UNREASONED: holds.${fn} needs a "reason": what it waits for, and why going live early would hurt.`);
        }
        if (typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint)) {
          problems.push(
            `INVALID: holds.${fn}.fingerprint must be the "sha256:…" of the code being held. ` +
              `The guard prints the current value.`,
          );
        }
        if (since !== undefined && (typeof since !== 'string' || !DAY.test(since))) {
          problems.push(`INVALID: holds.${fn}.since must be a YYYY-MM-DD date.`);
        }
        ledger.holds[fn] = {
          ref: typeof ref === 'string' ? ref : '',
          reason: typeof reason === 'string' ? reason : '',
          fingerprint: typeof fingerprint === 'string' ? fingerprint : '',
          ...(typeof since === 'string' ? { since } : {}),
        };
      }
    }
  }

  return { ledger, problems };
}

// Problems that need the repo: names that match no function, and holds whose code
// moved since the hold recorded it.
export function ledgerProblems(ledger: Ledger, current: Record<string, { fingerprint: string }>): string[] {
  const problems: string[] = [];
  for (const fn of ledger.order) {
    if (!(fn in current)) {
      problems.push(
        `STALE: "order" names '${fn}', but there is no deployable function at supabase/functions/${fn}/. ` +
          `Remove it, or restore the function.`,
      );
    }
  }
  for (const [fn, hold] of Object.entries(ledger.holds)) {
    const now = current[fn];
    if (!now) {
      problems.push(
        `STALE: holds.${fn} names a function that is not in supabase/functions/. Remove the hold, or restore the function.`,
      );
      continue;
    }
    if (FINGERPRINT.test(hold.fingerprint) && hold.fingerprint !== now.fingerprint) {
      problems.push(
        `HELD-DRIFT: '${fn}' is held (${hold.ref || 'no issue named'}) and its shipping code changed since the hold ` +
          `recorded it.\n` +
          `        held    : ${hold.fingerprint}\n` +
          `        current : ${now.fingerprint}\n` +
          `        This change will NOT go live when it merges; it waits behind the hold. If that is what you ` +
          `want, set holds.${fn}.fingerprint to the current value (and add a sentence to the reason if the ` +
          `hold now covers more). If it should go live, lift the hold by deleting the entry, or split the change. ` +
          `The fingerprint moves when anything the function inlines changes, often a shared file under lib/ or ` +
          `_shared/.`,
      );
    }
  }
  return problems;
}

// The deploy sequence: functions named in `order` first, in that order, then the
// rest alphabetically. Plain comparison, never localeCompare, so the runner's locale
// cannot reorder a deploy.
export function inDeployOrder<T extends { fn: string }>(items: T[], order: string[]): T[] {
  const rank = (fn: string) => {
    const i = order.indexOf(fn);
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => rank(a.fn) - rank(b.fn) || (a.fn < b.fn ? -1 : a.fn > b.fn ? 1 : 0));
}
