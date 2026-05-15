export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: 'bowl',    hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: 'warning', hasSeverity: true,  hasFood: false },
  diarrhea:     { label: 'Diarrhea',     icon: 'warning', hasSeverity: true,  hasFood: false },
  stool_normal: { label: 'Stool',        icon: 'check',   hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: 'sleep',   hasSeverity: true,  hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: 'scratch', hasSeverity: true,  hasFood: false },
  other:        { label: 'Other',        icon: 'plus',    hasSeverity: false, hasFood: false },
} as const;

// skin_reaction, scratch, weight_check, medication are valid schema event_type values
// but not exposed in the MVP quick-log UI. May be added post-MVP.

export type EventTypeKey = keyof typeof EVENT_TYPES;
