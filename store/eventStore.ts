import { create } from 'zustand';
import { EventTypeKey } from '../constants/eventTypes';

export interface NyxEvent {
  id: string;
  pet_id: string;
  event_type: EventTypeKey | 'other';
  occurred_at: string; // ISO UTC — canonical/derived point
  // B-010 event timestamp uncertainty. confidence NULL = unclassified (legacy).
  occurred_at_confidence?: 'witnessed' | 'estimated' | 'window' | null;
  occurred_at_earliest?: string | null; // ISO UTC, window lower bound
  occurred_at_latest?: string | null;   // ISO UTC, window upper bound
  severity: number | null;
  notes: string | null;
  source: 'manual' | 'reminder' | 'imported';
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // meal join
  food_item_id?: string | null;
  food_brand?: string | null;
  food_product_name?: string | null;
  food_type?: string | null;
  quantity?: string | null;
  // WSAVA 5-point owner-reported intake (B-014). NULL = unrated.
  intake_rating?: 'refused' | 'picked' | 'some' | 'most' | 'all' | null;
  // Medication (dose) join — populated only for event_type='medication' rows
  // (B-117 PR 8). Drug name from the library item; adherence is the offered-vs-given
  // rating (the intake_rating analog). NULL on non-medication events.
  medication_item_id?: string | null;
  adherence?: 'given' | 'partial' | 'missed' | 'refused' | null;
  drug_generic_name?: string | null;
  drug_brand_name?: string | null;
}

interface EventState {
  todayEvents: NyxEvent[];
  setTodayEvents: (events: NyxEvent[]) => void;
  prependEvent: (event: NyxEvent) => void;
  removeFromToday: (eventId: string) => void;
  patchInToday: (eventId: string, patch: Partial<NyxEvent>) => void;
}

export const useEventStore = create<EventState>((set) => ({
  todayEvents: [],
  setTodayEvents: (todayEvents) => set({ todayEvents }),
  prependEvent: (event) =>
    set((state) => ({ todayEvents: [event, ...state.todayEvents] })),
  removeFromToday: (eventId) =>
    set((state) => ({
      todayEvents: state.todayEvents.filter((e) => e.id !== eventId),
    })),
  patchInToday: (eventId, patch) =>
    set((state) => ({
      todayEvents: state.todayEvents.map((e) =>
        e.id === eventId ? { ...e, ...patch } : e,
      ),
    })),
}));
