import { Stack } from 'expo-router';
import { theme } from '../../constants/theme';
import { screenInColumn } from '../../components/ui/LayoutColumn';

// The onboarding navigation shell (B-251 PR 4). The flow's screens are
// file-routed, so they slot in as later PRs land (Landing/account → PR 5–6; pet
// setup → PR 7–9; paywall/done → PR 10) without being enumerated here. This owns
// only the shared chrome every step inherits:
//   • header hidden — each screen draws its own back affordance + progress bar
//     (components/onboarding/ProgressBar), so there's no default nav header;
//   • the swipe-back gesture ON, so back-navigation preserves entered values
//     (a pushed screen keeps its React state on the stack — v0.1 had no back at
//     all; §6 / AC "back preserves entered values");
//   • a consistent forward slide + one calm canvas colour behind every step, so
//     the flow reads as a single sequence rather than a set of unrelated screens;
//   • the content column, held inside each step (CUL-2703): the root leaves this group
//     alone, since a column around a native stack clips whatever a step bleeds past it.
export default function OnboardingLayout() {
  return (
    <Stack
      screenLayout={screenInColumn}
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.colorNeutralLight },
      }}
    />
  );
}
