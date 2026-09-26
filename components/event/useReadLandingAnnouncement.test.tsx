// CUL-1275 — the landing announcer, driven directly. The two section suites prove the real
// wiring on the shapes today's hosts produce; this pins the two rules those hosts cannot
// exercise, because both of today's first frames are a pending box or nothing at all:
//   · a host whose FIRST frame already shows a read says nothing (it was there, not landed);
//   · a host that re-keys the hook in place never speaks one incident's read over another.
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

function Host({ awaiting, id, line }: { awaiting: boolean; id: string; line: string | null }) {
  const announcer = useReadLandingAnnouncement({ awaitingRead: awaiting, identity: id });
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
});
