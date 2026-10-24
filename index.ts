// App entry. Code that must run before any screen, including in a headless
// background launch, is imported here first; Expo Router is loaded last.
import './src/monitoring/sentry';
import './src/background/refreshTask';
import { registerWidgetHandler } from './src/widget/widget';
import 'expo-router/entry';

registerWidgetHandler();
