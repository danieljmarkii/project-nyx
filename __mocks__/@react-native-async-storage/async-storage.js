// Jest manual mock — the official in-memory AsyncStorage mock, auto-applied to
// every test that imports the native module (which has no JS implementation
// under jest-expo). See https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
export { default } from '@react-native-async-storage/async-storage/jest/async-storage-mock';
