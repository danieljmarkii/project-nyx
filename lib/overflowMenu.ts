import { ActionSheetIOS, Alert, Platform } from 'react-native';

// Shared overflow ("⋯") menu, backed by the native iOS action sheet (PM call:
// familiar iOS pattern, free safe-dismiss + accessibility, no custom popover).
// Android falls back to an Alert with the same options. Used by the Header
// primitive's overflow slot — secondary/destructive actions only; the primary
// action stays an inline control on the screen (PM call, B-075).

export interface OverflowOption {
  label: string;
  // iOS renders exactly one option in red — the first destructive one wins.
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetConfig {
  options: string[];
  cancelButtonIndex: number;
  destructiveButtonIndex?: number;
  title?: string;
}

// Pure: turn our option list into the iOS ActionSheet config, with 'Cancel'
// appended as the last button. Exported so the index math (cancel index, the
// first-destructive index) is unit-tested without invoking the native module.
export function buildActionSheetConfig(
  options: OverflowOption[],
  title?: string,
): ActionSheetConfig {
  const labels = options.map((o) => o.label);
  const destructiveIndex = options.findIndex((o) => o.destructive);
  return {
    options: [...labels, 'Cancel'],
    cancelButtonIndex: labels.length,
    ...(destructiveIndex >= 0 ? { destructiveButtonIndex: destructiveIndex } : {}),
    ...(title ? { title } : {}),
  };
}

export function showOverflowMenu(
  options: OverflowOption[],
  opts?: { title?: string },
): void {
  if (options.length === 0) return;

  if (Platform.OS === 'ios') {
    const cfg = buildActionSheetConfig(options, opts?.title);
    ActionSheetIOS.showActionSheetWithOptions(cfg, (i) => {
      // i is the tapped index (or cancelButtonIndex). Only fire for a real option.
      if (i != null && i < options.length) options[i].onPress();
    });
  } else {
    Alert.alert(opts?.title ?? '', undefined, [
      ...options.map((o) => ({
        text: o.label,
        style: (o.destructive ? 'destructive' : 'default') as 'destructive' | 'default',
        onPress: o.onPress,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }
}
