import { isWhollyInView, scrollDeltaToReveal } from './revealInScroll';

const FRAME = { top: 100, bottom: 580 };

describe('scrollDeltaToReveal (CUL-2088)', () => {
  it('a node wholly in view needs no scroll', () => {
    expect(scrollDeltaToReveal({ top: 200, bottom: 300 }, FRAME, 16)).toBe(0);
    expect(isWhollyInView({ top: 200, bottom: 300 }, FRAME)).toBe(true);
  });

  it('a node below the fold (the photo meal on a small phone) scrolls up until its bottom is in, with the margin', () => {
    expect(scrollDeltaToReveal({ top: 560, bottom: 660 }, FRAME, 16)).toBe(96);
    expect(isWhollyInView({ top: 560, bottom: 660 }, FRAME)).toBe(false);
  });

  it('a node taller than the frame shows its start, never scrolls past it', () => {
    expect(scrollDeltaToReveal({ top: 300, bottom: 1000 }, FRAME, 16)).toBe(184);
  });

  it('a node above the frame scrolls down to it', () => {
    expect(scrollDeltaToReveal({ top: 40, bottom: 140 }, FRAME, 16)).toBe(-76);
  });
});
