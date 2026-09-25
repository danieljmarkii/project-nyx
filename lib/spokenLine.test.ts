// A drawn line, said (HV-10 / CUL-1167; HV-7's focus note 3).
import { spokenLine } from './spokenLine';

describe('spokenLine', () => {
  it('the spaced middle dot becomes a pause; nothing else changes', () => {
    expect(spokenLine('Sun, Sep 20 · nothing logged')).toBe('Sun, Sep 20, nothing logged');
    expect(spokenLine('1 day unlogged · 3 logged twice in the same minute')).toBe('1 day unlogged, 3 logged twice in the same minute');
    expect(spokenLine('nothing logged · Sep 13 – 16')).toBe('nothing logged, Sep 13 – 16');
    expect(spokenLine('Royal Canin·PR')).toBe('Royal Canin·PR');
  });
});
