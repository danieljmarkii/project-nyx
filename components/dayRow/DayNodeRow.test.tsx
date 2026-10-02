// `<DayNodeRow node>` (History v2, HV-1 / CUL-1158; spec §5.5 "node in, row out"): the
// one place a day's node picks its row, for Home's spine and History's day cards alike.
// Pinned here: an event node draws the event row and a run draws the run row, the row
// adds nothing of its own (the tree is the row's own tree), a run's open state is the
// caller's, and Home's spine draws every node through it.
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { fireEvent, render } from '@testing-library/react-native';
import type { DayEventNode, DayNode, DayRunNode } from '../../lib/dayNodes';
import { DayNodeRow } from './DayNodeRow';
import { SpineCompactRow, SpineEventRow } from './SpineNodeRow';
import { Spine } from '../designV2/home/Spine';

const meal = (id: string, time: string): DayEventNode => ({
  kind: 'event',
  id,
  category: 'meal',
  eventType: 'meal',
  title: 'Meal',
  detail: 'Royal Canin · Selected Protein PR',
  food: 'Royal Canin · Selected Protein PR',
  formatTag: null,
  intake: null,
  dose: null,
  carries: null,
  time,
  timeTag: null,
  timeMs: 0,
  photo: false,
  timing: null,
  read: { state: 'none' },
});

const vomit: DayEventNode = {
  ...meal('v1', '5:11 PM'),
  category: 'symptom',
  eventType: 'vomit',
  title: 'Vomit',
  detail: null,
  food: null,
  photo: true,
  timing: '4 min after eating',
};

const run: DayRunNode = {
  kind: 'compact',
  id: 'compact:m1',
  ids: ['m1', 'm2'],
  count: 2,
  title: '2 meals',
  detail: 'Royal Canin · Selected Protein PR',
  formats: null,
  timeRange: '12:41 – 3:02 PM',
  timeMs: 0,
  rows: [meal('m1', '12:41 PM'), meal('m2', '3:02 PM')],
};

/** A rendered tree as an owner could see it: a fresh handler closure per render is not a
 *  difference, so functions drop out of the comparison (the flag-off guards' fold). */
const seen = (tree: unknown): unknown => JSON.parse(JSON.stringify(tree));

describe('DayNodeRow picks the row and adds nothing', () => {
  // Every position on the thread: the first and last flags draw the thread's two
  // segments, so a row that dropped or forced one would be a different row.
  const POSITIONS = [
    { isFirst: true, isLast: true },
    { isFirst: true, isLast: false },
    { isFirst: false, isLast: true },
    { isFirst: false, isLast: false },
  ];

  it.each(POSITIONS)('an event node draws exactly the event row (isFirst=$isFirst, isLast=$isLast)', (pos) => {
    const viaRow = render(<DayNodeRow node={vomit} {...pos} expanded={false} onToggle={jest.fn()} onOpen={jest.fn()} />);
    const direct = render(<SpineEventRow node={vomit} {...pos} onOpen={jest.fn()} />);
    expect(seen(viaRow.toJSON())).toEqual(seen(direct.toJSON()));
    expect(viaRow.getByTestId('spine-node-v1')).toBeTruthy();
  });

  it.each(POSITIONS)('a run draws exactly the run row, closed and open (isFirst=$isFirst, isLast=$isLast)', (pos) => {
    for (const expanded of [false, true]) {
      const viaRow = render(<DayNodeRow node={run} {...pos} expanded={expanded} onToggle={jest.fn()} onOpen={jest.fn()} />);
      const direct = render(<SpineCompactRow node={run} {...pos} expanded={expanded} onToggle={jest.fn()} onOpen={jest.fn()} />);
      expect(seen(viaRow.toJSON())).toEqual(seen(direct.toJSON()));
      expect(viaRow.getByTestId('spine-node-compact:m1').props.accessibilityState).toEqual({ expanded });
    }
  });

  it('a run asks its caller to open it; an event opens its record', () => {
    const onToggle = jest.fn();
    const onOpen = jest.fn();
    const t = render(
      <>
        <DayNodeRow node={run} isFirst isLast={false} expanded={false} onToggle={onToggle} onOpen={onOpen} />
        <DayNodeRow node={vomit} isFirst={false} isLast expanded={false} onToggle={onToggle} onOpen={onOpen} />
      </>,
    );
    fireEvent.press(t.getByTestId('spine-node-compact:m1'));
    expect(onToggle).toHaveBeenCalledWith('compact:m1');
    fireEvent.press(t.getByTestId('spine-node-v1'));
    expect(onOpen).toHaveBeenCalledWith('v1');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Home’s spine draws every node through DayNodeRow', () => {
  it('the spine is the rows, in order, first and last marked — nothing else between them', () => {
    const nodes: DayNode[] = [run, vomit];
    const onOpen = jest.fn();
    const spine = render(<Spine nodes={nodes} onOpen={onOpen} />);
    const rows = render(
      <>
        {nodes.map((node, i) => (
          <DayNodeRow
            key={node.id}
            node={node}
            isFirst={i === 0}
            isLast={i === nodes.length - 1}
            expanded={false}
            onToggle={jest.fn()}
            onOpen={onOpen}
          />
        ))}
      </>,
    );
    const spineTree = spine.toJSON() as { children: unknown[] };
    expect(seen(spineTree.children)).toEqual(seen(rows.toJSON()));
  });

  it('the spine owns the open set: a tap on a run opens it in place', () => {
    const t = render(<Spine nodes={[run]} />);
    expect(t.queryByTestId('spine-members-compact:m1')).toBeNull();
    fireEvent.press(t.getByTestId('spine-node-compact:m1'));
    expect(t.getByTestId('spine-members-compact:m1')).toBeTruthy();
  });
});
