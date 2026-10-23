// CUL-2170: what a capture commit may record about its photos. A photo path is a
// claim that the object exists in Storage, so the commit lists only photos whose
// own upload resolved. Keyed by the photo's local URI, never its storage path:
// capture paths are fixed per slot (`{foodId}/0-front.jpg`, `…/0-label`), so a
// retake whose upload failed shares its path with the earlier photo that did
// upload, and a path key would record the retake against the old object.

export interface CaptureUploadPhoto {
  localUri: string;
  storagePath: string;
}

/** Storage paths of the photos whose upload finished, in the order given. */
export function uploadedPhotoPaths(
  photos: ReadonlyArray<CaptureUploadPhoto | null | undefined>,
  uploaded: ReadonlySet<string>,
): string[] {
  return photos
    .filter((p): p is CaptureUploadPhoto => !!p && uploaded.has(p.localUri))
    .map((p) => p.storagePath);
}

/** One photo's storage path if its upload finished, else null. */
export function uploadedPhotoPath(
  photo: CaptureUploadPhoto | null | undefined,
  uploaded: ReadonlySet<string>,
): string | null {
  return uploadedPhotoPaths([photo], uploaded)[0] ?? null;
}
