// Font registration for the v1.2 "Linear Clean" type system.
//
// Two faces, mapped to the theme's `fontBody` / `fontDisplay` slots:
//   • Geist (body)      — humanist sans for everything the owner reads.
//   • Newsreader (display) — editorial serif, reserved for the AI Signal headline.
//
// Why aliased family names ('Geist' / 'Newsreader') instead of the package's
// canonical `Geist_400Regular` names: the alias is the stable contract the theme
// tokens point at, so a future weight/source swap is a one-line change here and
// never touches a style sheet. Each weight is its OWN family because React Native
// does NOT synthesize weights for custom fonts — `fontWeight: '500'` on a single
// loaded face renders at 400. The body rollout (separate PR) maps the theme's
// weight tokens to these distinct families; this PR only consumes 'Newsreader'.
//
// Subpath imports keep the bundle to the four weights we actually register,
// rather than pulling every weight the packages ship.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';

// Passed to `useFonts` at the app entry point (app/_layout.tsx). Keys are the
// `fontFamily` strings the theme tokens reference.
export const fontMap = {
  Geist: Geist_400Regular,
  'Geist-Medium': Geist_500Medium,
  'Geist-SemiBold': Geist_600SemiBold,
  Newsreader: Newsreader_400Regular,
} as const;
