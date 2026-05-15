import { create } from 'zustand';

export interface PendingAttachment {
  localUri: string;
  takenAt: string | null; // ISO timestamp from photo EXIF, null if unavailable
  mimeType: string;
}

interface AttachmentStore {
  pendingAttachment: PendingAttachment | null;
  setPendingAttachment: (a: PendingAttachment | null) => void;
}

export const useAttachmentStore = create<AttachmentStore>((set) => ({
  pendingAttachment: null,
  setPendingAttachment: (a) => set({ pendingAttachment: a }),
}));
