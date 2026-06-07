import { CircleHelp, type LucideIcon } from 'lucide-react-native';
import { EVENT_TYPES, EventTypeKey } from '../../constants/eventTypes';
import { theme } from '../../constants/theme';

// Allowed icon sizes — the 16/20/24 step the design-system migration plan (§5)
// pins so glyphs sit consistently against adjacent copy across surfaces.
export type EventIconSize = 16 | 20 | 24;

// Resolve an event_type to its Lucide glyph. Pure + render-free so the fallback
// branch is unit-testable without pulling react-native-svg into jest. Unknown /
// UI-unexposed types (skin_reaction, weight_check, medication, scratch, or a
// stale imported row) get CircleHelp — deliberately NOT Circle, which is the
// real glyph for stool_normal, so an unknown type can't masquerade as a stool.
export function iconForType(type: EventTypeKey | string): LucideIcon {
  return EVENT_TYPES[type as EventTypeKey]?.icon ?? CircleHelp;
}

interface Props {
  // Accepts the raw event_type string (callers cast from the DB), not just a
  // known key — unknown/legacy types fall back to a neutral Circle so a row
  // never renders a blank where an emoji used to be.
  type: EventTypeKey | string;
  size?: EventIconSize;
  // Tint. Defaults to fg-2 (secondary) per the iconography rule; pass
  // theme.colorAccent for interactive glyphs or theme.colorEventSymptom on
  // symptom surfaces.
  color?: string;
}

/**
 * The single render path for an event-type identity glyph. Reads the Lucide
 * icon ref from EVENT_TYPES so the type→glyph mapping lives in exactly one
 * place (constants/eventTypes.ts). Stroke is fixed at 1.75px — inside the
 * 1.5–2px band the design principles' iconography rule calls for.
 */
export function EventIcon({ type, size = 20, color = theme.colorTextSecondary }: Props) {
  const Icon = iconForType(type);
  return <Icon size={size} color={color} strokeWidth={1.75} />;
}
