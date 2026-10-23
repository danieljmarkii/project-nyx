// Web stand-in for react-native-web's findNodeHandle (CUL-1895 capture path only). The
// real one throws on web; on a phone it returns the view's native tag. lib/a11yFocus.ts
// asks for one to move VoiceOver focus after a History landing, and the throw reached the
// crash screen, which no phone can show. Null is the helper's own off-device answer
// ("a missing tag is a no-op"), so the landing proceeds and only the focus is skipped.
export default function findNodeHandle(): null {
  return null;
}
