import { buildActionSheetConfig } from './overflowMenu';

const noop = () => {};

describe('buildActionSheetConfig', () => {
  it('appends Cancel as the last button and points cancelButtonIndex at it', () => {
    const cfg = buildActionSheetConfig([
      { label: 'Edit', onPress: noop },
      { label: 'Remove', destructive: true, onPress: noop },
    ]);
    expect(cfg.options).toEqual(['Edit', 'Remove', 'Cancel']);
    expect(cfg.cancelButtonIndex).toBe(2);
  });

  it('marks the first destructive option as the destructive button', () => {
    const cfg = buildActionSheetConfig([
      { label: 'Edit', onPress: noop },
      { label: 'Remove', destructive: true, onPress: noop },
    ]);
    expect(cfg.destructiveButtonIndex).toBe(1);
  });

  it('omits destructiveButtonIndex when no option is destructive', () => {
    const cfg = buildActionSheetConfig([{ label: 'Share', onPress: noop }]);
    expect(cfg.destructiveButtonIndex).toBeUndefined();
    expect(cfg.options).toEqual(['Share', 'Cancel']);
    expect(cfg.cancelButtonIndex).toBe(1);
  });

  it('uses the FIRST destructive option when several are flagged', () => {
    const cfg = buildActionSheetConfig([
      { label: 'Archive', destructive: true, onPress: noop },
      { label: 'Delete', destructive: true, onPress: noop },
    ]);
    expect(cfg.destructiveButtonIndex).toBe(0);
  });

  it('includes the title only when given', () => {
    expect(buildActionSheetConfig([{ label: 'Remove', onPress: noop }]).title).toBeUndefined();
    expect(
      buildActionSheetConfig([{ label: 'Remove', onPress: noop }], 'Vomit').title,
    ).toBe('Vomit');
  });
});
