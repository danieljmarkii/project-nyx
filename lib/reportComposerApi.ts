// The composer's two reads (Vet report v2 PR-16, CUL-2296): `generate-report` in composer mode.
// Every number comes back from the server, off the report's own snapshot; the parse in
// `lib/reportComposer.ts` refuses a payload it cannot vouch for rather than painting a guess.

import { supabase } from './supabase';
import { getDeviceTimezone } from './profile';
import {
  parseComposerOpen,
  parseComposerWindow,
  type ComposerOpen,
  type ComposerWindowCounts,
} from './reportComposer';

/** The live-flag set, the windows on offer and the first window's counts. */
export async function fetchComposerOpen(petId: string): Promise<ComposerOpen> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { mode: 'composer', part: 'open', petId, timezone: getDeviceTimezone() },
  });
  if (error) throw new Error(`Composer read failed: ${error.message}`);
  return parseComposerOpen(data);
}

/** One window's counts, and the days after it when it ends before today. */
export async function fetchComposerWindow(petId: string, startDate: string, endDate: string): Promise<ComposerWindowCounts> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { mode: 'composer', part: 'window', petId, startDate, endDate, timezone: getDeviceTimezone() },
  });
  if (error) throw new Error(`Composer window read failed: ${error.message}`);
  return parseComposerWindow(data);
}
