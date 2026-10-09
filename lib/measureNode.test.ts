// `measureNodeInWindow` (D2-6 · CUL-1069): the platform's answer, or null — exactly once.

import { MEASURE_GRACE_MS, measureNodeInWindow, measureNodeOnPage } from './measureNode';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('measureNodeInWindow', () => {
  it('no node, or a node without the API, answers null at once', () => {
    const cb = jest.fn();
    measureNodeInWindow(null, cb);
    measureNodeInWindow(undefined, cb);
    measureNodeInWindow({} as never, cb);
    expect(cb).toHaveBeenCalledTimes(3);
    for (const call of cb.mock.calls) expect(call[0]).toBeNull();
  });

  it('the platform’s answer is the rect, and the grace timer is disarmed', () => {
    const cb = jest.fn();
    const node = { measureInWindow: (f: (x: number, y: number, w: number, h: number) => void) => f(1, 2, 3, 4) };
    measureNodeInWindow(node as never, cb);
    expect(cb).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });
    jest.advanceTimersByTime(MEASURE_GRACE_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('an answer the platform never delivers resolves null after the grace — and a late answer is dropped', () => {
    const cb = jest.fn();
    let late: ((x: number, y: number, w: number, h: number) => void) | null = null;
    const node = {
      measureInWindow: (f: (x: number, y: number, w: number, h: number) => void) => {
        late = f;
      },
    };
    measureNodeInWindow(node as never, cb);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(MEASURE_GRACE_MS);
    expect(cb).toHaveBeenCalledWith(null);
    (late as unknown as (x: number, y: number, w: number, h: number) => void)(1, 2, 3, 4);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// CUL-1278 — the hold-and-slide hit-tests a touch's page point, so it measures in the
// same space: `measure`'s pageX / pageY, never the window frame or the parent offset.
describe('measureNodeOnPage', () => {
  type PageCb = (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void;

  it('no node, or a node without the API, answers null at once', () => {
    const cb = jest.fn();
    measureNodeOnPage(null, cb);
    measureNodeOnPage({ measureInWindow: () => {} } as never, cb);
    expect(cb).toHaveBeenCalledTimes(2);
    for (const call of cb.mock.calls) expect(call[0]).toBeNull();
  });

  it('answers the PAGE origin, not the offset within the parent', () => {
    const cb = jest.fn();
    const node = { measure: (f: PageCb) => f(5, 6, 30, 40, 100, 200) };
    measureNodeOnPage(node as never, cb);
    expect(cb).toHaveBeenCalledWith({ x: 100, y: 200, width: 30, height: 40 });
    jest.advanceTimersByTime(MEASURE_GRACE_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('an answer that never comes resolves null after the grace, and a late one is dropped', () => {
    const cb = jest.fn();
    let late: PageCb | null = null;
    measureNodeOnPage({ measure: (f: PageCb) => { late = f; } } as never, cb);
    jest.advanceTimersByTime(MEASURE_GRACE_MS);
    expect(cb).toHaveBeenCalledWith(null);
    (late as unknown as PageCb)(0, 0, 1, 1, 2, 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
