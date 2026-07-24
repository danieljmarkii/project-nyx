import { ScopeMenu, ScopeMenuOption } from '../ui/ScopeMenu';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';

// The History event-type lens. It was the last h-scroll chip rail in the app —
// kept through B-146 on the strength of its edge-fade "there's more" cue, until
// a real owner went looking for the Medication filter and never found it (it sat
// 8th of 9 chips, well past the fold). A peek cue softens a hidden overflow; it
// doesn't cure it. Now the same pill + sheet as the date scope beside it: every
// type is a full-width row, none can hide.
//
// Labels + glyphs read from EVENT_TYPES so a filter can never drift from its row
// label (it used to hardcode "Diarrhea" while the rows render "Loose stool").
// Order keeps the two stool types adjacent for scanning. `weight_check` is
// loggable (B-186) and gains a filter here for the first time.
const TYPE_FILTER_KEYS: EventTypeKey[] = [
  'meal', 'vomit', 'diarrhea', 'stool_normal', 'lethargy', 'itch',
  'medication', 'weight_check', 'other',
];

const TYPE_OPTIONS: ScopeMenuOption[] = [
  { key: null, label: 'All types' },
  ...TYPE_FILTER_KEYS.map((key) => ({
    key,
    label: EVENT_TYPES[key].label,
    icon: EVENT_TYPES[key].icon,
  })),
];

interface Props {
  value: EventTypeKey | null;
  onChange: (key: EventTypeKey | null) => void;
}

export function TypeScopeControl({ value, onChange }: Props) {
  return (
    <ScopeMenu
      options={TYPE_OPTIONS}
      value={value}
      // Keys come from TYPE_FILTER_KEYS above, so the widened string|null narrows back safely.
      onChange={(key) => onChange(key as EventTypeKey | null)}
      sheetLabel="Show only"
      accessibilityPrefix="Event type"
    />
  );
}
