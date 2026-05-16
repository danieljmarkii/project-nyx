import { create } from 'zustand';
import { EventTypeKey } from '../constants/eventTypes';

export interface NyxEvent {
  id: string;
  pet_id: string;
  event_type: EventTypeKey | 'other';
  occurred_at: string; // ISO UTC
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
  quantity?: string | null;
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
