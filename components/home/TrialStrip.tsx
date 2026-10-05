// The Home trial strip (B-417 PR 4, §4.2; the door since TS-5 / CUL-1301, for every
// account since TS-GA / CUL-1307).
//
// A running trial gets a COMPACT DOOR on Home, not a second full card, and the tap opens
// the trial's own screen, `/trial/{pet}` (`docs/nyx-trial-screen-requirements.md` §5.1).
//
// ── PLACEMENT IS THE DESIGN ──────────────────────────────────────────────────
// It sits BELOW SignalZone and ABOVE TodayZone, deliberately: Principle 3 says
// safety insights always lead, and a trial is CONTEXT, not an insight. And it
// renders ONLY while a trial is active — Home gains nothing when there isn't
// one, which is `resolveTrialStrip` returning null rather than a prop this
// component has to remember to check.
//
// The Pet tab is not a surface the wedge owner visits daily; the trial is the
// thing they live with for eight weeks. That gap is the whole reason this exists.
//
// ── TWO DRAWINGS, ONE HOST ───────────────────────────────────────────────────────
// `components/trialScreen/TrialStripDoor` (the Signal row's grammar, this week's lane) is
// the drawing; under `design_v2` it is `components/designV2/home/TrialCard` (CUL-1526:
// title, a neutral bar, the one end-date line). Home passes its one `useDesignV2()` read
// down as `designV2`, so the redesign gains no second consumer of the gate (C-36).
import type { TrialStripSafety } from '../../lib/trialStripDoor';
import { TrialStripDoor } from '../trialScreen/TrialStripDoor';
import { TrialCard } from '../designV2/home/TrialCard';
import type { TrialCardInput, TrialStripModel } from '../../lib/dietTrialCard';

interface Props {
  model: TrialStripModel | null;
  /** Overridable so the test drives navigation without a router mock. */
  onPress?: () => void;
  /** TS-5 — the pet the strip's card input was loaded for (`useDietTrial().loadedPetId`). */
  petId?: string | null;
  /** TS-5 — the card input the model was resolved from, for this week's lane. */
  input?: TrialCardInput | null;
  /** TS-5 — whether `input` is loaded for the pet Home names. */
  inputFresh?: boolean;
  /** TS-5 — what the Signal zone reports about safety-class cards for its pet. */
  safety?: TrialStripSafety | null;
  /** CUL-1526 — Home's `useDesignV2()` read, handed down. */
  designV2?: boolean;
}

export function TrialStrip({
  model,
  onPress,
  petId = null,
  input = null,
  inputFresh = false,
  safety = null,
  designV2 = false,
}: Props) {
  // No pet to open means no door. Home's model is resolved from the input loaded for
  // `petId`, so a model without one is a frame that has nothing to name.
  if (!model || !petId) return null;
  if (designV2) return <TrialCard model={model} petId={petId} onPress={onPress} />;
  return (
    <TrialStripDoor
      model={model}
      petId={petId}
      input={input}
      inputFresh={inputFresh}
      safety={safety}
      onPress={onPress}
    />
  );
}
