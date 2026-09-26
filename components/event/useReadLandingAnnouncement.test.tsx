// CUL-1275 — the landing announcer, driven directly. The two section suites prove the real
// wiring on the shapes today's hosts produce; this pins the rules those hosts cannot
// exercise, because both of today's first frames are a pending box or nothing at all:
//   · a host whose FIRST frame already shows a read says nothing (it was there, not landed);
//   · a host that re-keys the hook in place never speaks one incident's read over another;
// and the adversarial pass's rule, stated at the hook's own boundary: a wait that ends with
// the row's change marker unmoved (a give-up, a re-run the server skipped) says nothing.
// The stage below reports the way `IncidentReadSection` does: from a layout effect, which
// runs before the host's, so the edge reads the line of the commit it fires in.
import { useLayoutEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import {
  readLandedCopy,
  useReadLandingAnnouncement,
  type ReadLandingAnnouncer,
} from './useReadLandingAnnouncement';

function Stage({ announcer, line }: { announcer: ReadLandingAnnouncer; line: string | null }) {
  useLayoutEffect(() => {
    announcer.note(line);
  }, [announcer, line]);
  useLayoutEffect(() => () => announcer.note(null), [announcer]);
  return null;
}

// `v` is the row's change marker. It defaults to a fresh value per render so the cases that
// are not about it read as "the row moved"; the cases that ARE about it pass it explicitly.
let tick = 0;
function Host({
  awaiting, id, line, v,
}: { awaiting: boolean; id: string; line: string | null; v?: string | null }) {
  const version = v === undefined ? `t${(tick += 1)}` : v;
  const announcer = useReadLandingAnnouncement({ awaitingRead: awaiting, identity: id, version });
  return line === null ? null : <Stage announcer={announcer} line={line} />;
}

let announce: jest.SpyInstance;
beforeEach(() => {
  // RN's jest preset already makes this a `jest.fn`; `spyOn` returns that mock, calls and all.
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
});
afterEach(() => announce.mockRestore());

describe('useReadLandingAnnouncement', () => {
  it('speaks what the stage shows when a read the host waited for lands', () => {
    const view = render(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e1" line="Worth a call" />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
  });

  it('says nothing for a read already showing on the first frame — it was there, it did not land', () => {
    const view = render(<Host awaiting={false} id="e1" line="Worth a call" />);
    view.rerender(<Host awaiting={false} id="e1" line="Worth a call" />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('says nothing when the host re-keys to another incident in the same commit a read lands', () => {
    const view = render(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e2" line="Keep an eye out" />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('says nothing when the wait ends on a stage that shows nothing', () => {
    const view = render(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e1" line={null} />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('never speaks a stale line from a stage that has since unmounted', () => {
    // Content, then a new wait (the stage goes), then a landing that renders nothing.
    const view = render(<Host awaiting={false} id="e1" line="Keep an eye out" />);
    view.rerender(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e1" line={null} />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('speaks each landing on the same incident — a re-run is a second wait', () => {
    const view = render(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e1" line="Keep an eye out" />);
    view.rerender(<Host awaiting id="e1" line={null} />);
    view.rerender(<Host awaiting={false} id="e1" line="Worth a call" />);
    expect(announce.mock.calls).toEqual([
      [readLandedCopy('Keep an eye out')],
      [readLandedCopy('Worth a call')],
    ]);
  });

  it('says nothing when the wait ends with the row UNMOVED — the give-up, with no row at all', () => {
    // The watch exhausted its schedule offline; the section falls to the not-enough card.
    // Spoken, that would be a not_enough_to_say verdict over a record that may hold a
    // Worth a call the client never heard about.
    const view = render(<Host awaiting id="e1" line={null} v={null} />);
    view.rerender(<Host awaiting={false} id="e1" line="Not enough to say about this one yet." v={null} />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('says nothing for a re-run the server SKIPPED — the old verdict is not a new read', () => {
    const view = render(<Host awaiting={false} id="e1" line="Keep an eye out" v="t-old" />);
    view.rerender(<Host awaiting id="e1" line="Keep an eye out" v="t-old" />);
    view.rerender(<Host awaiting={false} id="e1" line="Keep an eye out" v="t-old" />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('speaks the same re-run once the server has actually written', () => {
    const view = render(<Host awaiting={false} id="e1" line="Keep an eye out" v="t-old" />);
    view.rerender(<Host awaiting id="e1" line="Keep an eye out" v="t-old" />);
    view.rerender(<Host awaiting={false} id="e1" line="Keep an eye out" v="t-new" />);
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Keep an eye out'));
  });

  it('compares against what the row held when the WAIT began, not the render before the fall', () => {
    // The marker can move mid-wait (the stale pending row is re-read) and then not move on
    // the fall; that is still a row that moved since the owner started waiting.
    const view = render(<Host awaiting={false} id="e1" line={null} v={null} />);
    view.rerender(<Host awaiting id="e1" line={null} v="t-pending" />);
    view.rerender(<Host awaiting id="e1" line={null} v="t-done" />);
    view.rerender(<Host awaiting={false} id="e1" line="Worth a call" v="t-done" />);
    expect(announce).toHaveBeenCalledWith(readLandedCopy('Worth a call'));
  });
});
