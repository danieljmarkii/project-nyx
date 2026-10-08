// The I/O shell both PreToolUse hooks share (CUL-1616). The harness pipes one JSON
// object on stdin (`tool_name`, `tool_input`, `cwd`, `permission_mode`, …) and reads
// one JSON object on stdout; no stdout means "no opinion", and the platform's own
// permission flow decides the call as if the hook did not exist.
//
// Fail closed: an input this shell cannot parse, or a rule that throws, still
// answers, with the hook's `onError` decision. A hook that crashes instead would exit
// non-zero, which the harness treats as a non-blocking error and then RUNS the call.
// The settings.json command adds the last layer: when node itself cannot start, its
// `|| printf` prints the same fallback.

export type Verdict = 'ask' | 'deny' | 'allow';
export type Decision = { decision: Verdict; reason: string };

/** The fields of the PreToolUse payload the rules read; everything else is ignored. */
export type HookInput = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
};

/**
 * A payload with no tool name is not one the rules can judge, so it throws and the
 * caller answers with its fail-closed decision. Reading it as an unknown tool would give
 * "no opinion", and a renamed field in a harness release would switch the gate off.
 */
export function toHookInput(raw: unknown): HookInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the payload is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.tool_name !== 'string' || o.tool_name === '') throw new Error('the payload names no tool');
  const ti = o.tool_input;
  return {
    tool_name: o.tool_name,
    tool_input: ti !== null && typeof ti === 'object' && !Array.isArray(ti) ? (ti as Record<string, unknown>) : {},
    cwd: typeof o.cwd === 'string' ? o.cwd : process.cwd(),
  };
}

export function hookOutput(d: Decision): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: d.decision,
      permissionDecisionReason: d.reason,
    },
  });
}

/** Parse one payload and decide it, converting any failure into `onError`. */
export function decideRaw(
  raw: string,
  decide: (input: HookInput) => Decision | null,
  onError: Decision,
): Decision | null {
  try {
    return decide(toHookInput(JSON.parse(raw)));
  } catch {
    return onError;
  }
}

export function runHook(decide: (input: HookInput) => Decision | null, onError: Decision): void {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    const d = decideRaw(raw, decide, onError);
    if (d) process.stdout.write(hookOutput(d));
  });
}
