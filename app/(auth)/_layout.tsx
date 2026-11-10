import { Stack } from 'expo-router';
import { screenInColumn } from '../../components/ui/LayoutColumn';

// Each screen holds the content column inside itself (CUL-2703): the root leaves this
// group alone, so the Landing's night can reach the window's edges.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} screenLayout={screenInColumn} />;
}
