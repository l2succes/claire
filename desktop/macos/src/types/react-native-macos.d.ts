import 'react-native';

/** React Native macOS exposes this native drag-region prop at runtime, but
 * the desktop package's shared React Native declarations do not include it. */
declare module 'react-native' {
  interface ViewProps {
    mouseDownCanMoveWindow?: boolean;
  }
}
