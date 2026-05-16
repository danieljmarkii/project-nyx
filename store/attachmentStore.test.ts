import { useAttachmentStore } from './attachmentStore';

describe('attachmentStore', () => {
  beforeEach(() => {
    useAttachmentStore.setState({ pendingAttachment: null });
  });

  it('initializes with null pending attachment', () => {
    expect(useAttachmentStore.getState().pendingAttachment).toBeNull();
  });

  it('stores a pending attachment with all fields', () => {
    const attachment = {
      localUri: 'file:///tmp/photo.jpg',
      takenAt: '2026-05-15T10:32:00.000Z',
      mimeType: 'image/jpeg',
    };
    useAttachmentStore.getState().setPendingAttachment(attachment);
    expect(useAttachmentStore.getState().pendingAttachment).toEqual(attachment);
  });

  it('stores a pending attachment with null takenAt (no EXIF)', () => {
    const attachment = { localUri: 'file:///tmp/photo.jpg', takenAt: null, mimeType: 'image/jpeg' };
    useAttachmentStore.getState().setPendingAttachment(attachment);
    expect(useAttachmentStore.getState().pendingAttachment?.takenAt).toBeNull();
  });

  it('clears a pending attachment by setting null', () => {
    useAttachmentStore.getState().setPendingAttachment({
      localUri: 'file:///tmp/photo.jpg', takenAt: null, mimeType: 'image/jpeg',
    });
    useAttachmentStore.getState().setPendingAttachment(null);
    expect(useAttachmentStore.getState().pendingAttachment).toBeNull();
  });

  it('replaces an existing pending attachment', () => {
    const first = { localUri: 'file:///first.jpg', takenAt: null, mimeType: 'image/jpeg' };
    const second = { localUri: 'file:///second.jpg', takenAt: '2026-05-15T12:00:00.000Z', mimeType: 'image/jpeg' };
    useAttachmentStore.getState().setPendingAttachment(first);
    useAttachmentStore.getState().setPendingAttachment(second);
    expect(useAttachmentStore.getState().pendingAttachment?.localUri).toBe('file:///second.jpg');
  });
});
