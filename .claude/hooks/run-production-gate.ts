// PreToolUse entry for the production-write gate (CUL-1616), wired in .claude/settings.json.
// The rules live in productionGate.ts; this file only connects them to stdin and stdout.
import { runHook } from './hookIo.ts';
import { decideGate } from './productionGate.ts';

runHook(decideGate, {
  decision: 'ask',
  reason: 'The production gate could not read this call (CUL-1616), so a person decides it.',
});
