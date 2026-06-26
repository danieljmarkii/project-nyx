import { create } from 'zustand';
import { EventTypeKey } from '../constants/eventTypes';
import type { DoseVehicle } from '../lib/medications';

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
  // Weight reading in kg (B-186) — populated only for event_type='weight_check'
  // rows, NULL otherwise. The value IS the event; carried on the optimistic row
  // so a future trend/History renderer can show it without a re-query.
  weight_kg?: number | null;
  // Medication (dose) join — populated only for event_type='medication' rows
  // (B-117 PR 8). Drug name from the library item; adherence is the offered-vs-given
  // rating (the intake_rating analog). NULL on non-medication events.
  medication_item_id?: string | null;
  adherence?: 'given' | 'partial' | 'missed' | 'refused' | null;
  // B-156 Slice B — the dose vehicle ("how it was given"). NULL = not recorded.
  // Descriptive only (no adherence/safety meaning); renders nothing when unset.
  // Uses the canonical DoseVehicle type so it can't drift from the server enum.
  how_given?: DoseVehicle | null;
  // B-156 PR B3 — the combo safety-coupling read fields (NULL on a standalone dose /
  // non-medication event). paired_event_id = the co-logged meal/treat this dose was
  // given inside; paired_vehicle_intake = THAT meal's intake_rating; paired_food_name
  // = its food name (for the resurface copy). A read surface derives the IN-DOUBT state
  // (isComboDoseInDoubt: combo + vehicle refused/picked + adherence null) from these —
  // the History "Unconfirmed" tag and the dose-detail resurface note.
  paired_event_id?: string | null;
  paired_vehicle_intake?: 'refused' | 'picked' | 'some' | 'most' | 'all' | null;
  paired_food_name?: string | null;
  drug_generic_name?: string | null;
  drug_brand_name?: string | null;
  // B-156 PR B4 — the reverse combo link (vehicle → dose), for the cross-link on a
  // meal/treat row that carried co-logged dose(s). The mirror of paired_* above so the
  // combo reads from BOTH sides without merging. count = NON-DELETED paired doses (0 on a
  // non-meal row); event_id = the nav target (the single dose when count=1); drug_name =
  // that dose's drug for the single-dose label. A soft-deleted dose drops out of the count.
  paired_dose_count?: number;
  paired_dose_event_id?: string | null;
  paired_dose_drug_name?: string | null;
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
