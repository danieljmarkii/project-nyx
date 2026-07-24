import { ScopeMenu } from '../ui/ScopeMenu';
import type { DatePreset } from '../../lib/historyDateFilter';

// The History time-scope control. Scope (when) is a single mutually-exclusive
// choice with long labels, so it's a quiet menu — NOT a chip rail. The old
// design crammed four date chips into a fixed row beside the title, which clipped
// "Last 30 days" off-screen with no way to scroll to it. The pill + bottom sheet
// never clips and keeps the full friendly labels; the pattern itself now lives in
// the shared ScopeMenu (the event-type lens uses the same one, so the two
// History filters can't drift apart visually or behaviorally).
//
// DatePreset is defined in lib/historyDateFilter (with the pure range logic) and
// re-exported here so existing importers (app/(tabs)/history) keep working.
export type { DatePreset };

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: null, label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

interface Props {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
  // A single-day drill-in filter's label ("Jun 24", B-308). When set it's the active
  // scope shown on the pill; it isn't a menu option (it arrives via the Calendar deep-link),
  // so picking any preset from the sheet switches away from it (onChange clears it upstream).
  dayLabel?: string | null;
}

export function DateScopeControl({ value, onChange, dayLabel }: Props) {
  return (
    <ScopeMenu
      options={DATE_PRESETS}
      value={value}
      // Keys come from DATE_PRESETS above, so the widened string|null narrows back safely.
      onChange={(key) => onChange(key as DatePreset)}
      sheetLabel="Show events from"
      accessibilityPrefix="Date range"
      overrideLabel={dayLabel}
    />
  );
}
