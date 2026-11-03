// The saved copy's pin mirrors two sentences of the server's confounder line (CUL-2467,
// adversarial pass 1): the bowl warning, and the no-medication sentence it leads. Same value, same
// question (C-34). This reds when the server's wording drifts, so the pin never silently stops
// leading with the bowl.

import { readFileSync } from 'fs';
import { join } from 'path';
import { SAVED_COPY_BOWL_WARNING, SAVED_COPY_NO_MEDICATION } from '../lib/examRoom';

const src = readFileSync(join(__dirname, '..', 'supabase/functions/generate-report/documentV2.ts'), 'utf8');

it('the bowl warning is the server’s BOWL_WARNING, word for word', () => {
  expect(src).toContain(`const BOWL_WARNING = '${SAVED_COPY_BOWL_WARNING}'`);
});

it('the no-medication sentence is the server’s `none`, word for word', () => {
  expect(src).toContain(`const none = '${SAVED_COPY_NO_MEDICATION}'`);
});
