// PreToolUse entry for the relay form (CUL-1616), wired in .claude/settings.json.
// The rules live in relayForm.ts; this file only connects them to stdin and stdout.
import { runHook } from './hookIo.ts';
import { decideRelay } from './relayForm.ts';

runHook(decideRelay, {
  decision: 'deny',
  reason: 'The relay-form hook could not read this message (CUL-1616), so it is not sent.',
});
