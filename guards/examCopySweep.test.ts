// CUL-2429: the exam room's offline copy (the whole record, band photos included) is swept at
// every launch, so a copy left by a crash or a kill with the room open never outlives the next
// launch. The sweep must run at MODULE LOAD of the root layout: an effect in the root runs after
// its children mount, so a deep link straight into the room would read the crash-left copy first.
import { readFileSync } from 'fs';
import { join } from 'path';

const LAYOUT = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

it('CUL-2429: the root layout imports clearExamCopy from the copy module', () => {
  expect(LAYOUT).toMatch(/import \{[^}]*\bclearExamCopy\b[^}]*\} from '\.\.\/lib\/examRoomCopy';/);
});

it('CUL-2429: clearExamCopy() is called at module scope, before any component in the file', () => {
  // A top-level statement: at column 0, never inside a function or an effect.
  const call = LAYOUT.search(/^clearExamCopy\(\);$/m);
  expect(call).toBeGreaterThan(-1);
  const firstComponent = LAYOUT.search(/^(export default )?function [A-Z]/m);
  expect(firstComponent).toBeGreaterThan(-1);
  expect(call).toBeLessThan(firstComponent);
});
