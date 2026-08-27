// Pure derivation for the event-detail hero + full-screen viewer: which photo URI
// to render, and whether to show the "add a photo" empty state. Extracted from
// app/event/[id].tsx so the transform→raw fallback logic (B-207) is unit-testable
// without mounting the screen — this is exactly the class of bug a screen test
// wouldn't cheaply catch: a stale fallback URL surviving a photo removal, or a
// live "Add photo" target flashing over an existing photo mid-fallback.

export interface EventPhotoInput {
  // On-device file (preferred — no network). null when absent or cache-evicted.
  localUri: string | null;
  // Screen-sized transform URL (imgproxy). null while resolving or if signing failed.
  remoteUrl: string | null;
  // Raw original URL — the fallback when the transform can't load. null while resolving.
  remoteUrlFull: string | null;
  // The transform URL errored at fetch time (add-on unavailable) → prefer the raw URL.
  transformFailed: boolean;
  // Does this leaf carry a photo affordance at all? (EVENT_TYPES hasPhoto — taxonomy
  // §7, CUL-675.) false suppresses the empty Add-photo hero, never an existing
  // photo: meals (their clinical artifact is the food name, not a photo — never beg
  // for one) and the witnessed-by-construction leaves (cough/sneeze — no visual
  // evidence to photograph). Callers pass `hasPhoto ?? true` so an UNKNOWN type (a
  // future wave's leaf reaching this build) keeps today's generic offer — the §8
  // degradation contract: degrade to the generic behaviour, never crash or invent.
  offersPhoto: boolean;
  // An attachment row exists (a photo is present, even if its URL is still resolving).
  hasAttachment: boolean;
}

export interface EventPhotoDisplay {
  photoUri: string | null;
  showEmptyHero: boolean;
}

// The copy the add-photo empty hero renders: the tap-target's action label, plus
// an optional line teaching what a photo is FOR on this kind of event.
export interface AddPhotoHeroCopy {
  action: string;
  hint: string | null;
}

const ADD_PHOTO_ACTION = 'Add photo';

// B-371 — for the two event types that have a shipped photo read, the generic
// "Add photo" hero was the ONLY remaining signal on a photoless symptom once
// B-363 suppressed the dead AI-read frame, and it never taught that for these
// events the photo IS the clinical artifact. Principle 5: an empty state names
// what a photo gets you.
//
// Scoped deliberately to vomit + stool — the types `analyze-vomit` /
// `analyze-stool` actually read. The other SYMPTOM_TYPES (lethargy, itch) get
// the bare action label: no skin/behaviour read is shipped, so promising one
// would be a lie the product can't honour. Widen this map when a sibling
// analyzer ships, not before.
//
// Voice + clinical bar (nyx-voice P2/P3/P5, clinical-guardrails P1): the hint
// names the specific observations the read produces, in plain language (no
// "Bristol type", no "haematochezia"), and describes only what CAN be looked
// at. It never promises a verdict and never implies a photo — or the absence of
// one — says the pet is well. Asserted by test, not by comment.
const ADD_PHOTO_HINTS: Record<string, string> = {
  vomit: "With a photo, I can read the colour, consistency, and whether there's blood.",
  diarrhea: "With a photo, I can read the colour, consistency, and whether there's blood or mucus.",
  stool_normal: "With a photo, I can read the colour, consistency, and whether there's blood or mucus.",
};

export function addPhotoHeroCopy(eventType: string | null | undefined): AddPhotoHeroCopy {
  return {
    action: ADD_PHOTO_ACTION,
    hint: (eventType && ADD_PHOTO_HINTS[eventType]) ?? null,
  };
}

export function resolveEventPhotoDisplay(input: EventPhotoInput): EventPhotoDisplay {
  const { localUri, remoteUrl, remoteUrlFull, transformFailed, offersPhoto, hasAttachment } = input;
  // Prefer the transform; fall back to the raw URL if it failed to load or hasn't
  // resolved yet. The local file always wins (fastest, offline-safe).
  const remoteBest = !transformFailed && remoteUrl ? remoteUrl : remoteUrlFull;
  const photoUri = localUri ?? remoteBest;
  // Only offer the add-photo empty state when there is genuinely NO photo — never
  // when an attachment exists but its URL is still resolving / mid-fallback, which
  // would briefly render a live "Add photo" target over an existing photo (B-207)
  // — and only on a leaf that offers a photo at all (a sneeze detail never leads
  // with an empty Add-photo zone; an EXISTING photo on such a row still renders,
  // because photoUri wins this branch — e.g. an `other` row with a photo re-keyed
  // to cough by the §11 swap keeps its evidence).
  const showEmptyHero = !photoUri && offersPhoto && !hasAttachment;
  return { photoUri, showEmptyHero };
}
