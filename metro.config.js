// Sentry's Expo config adds debug IDs to bundles so crash stack traces map
// back to source. It is otherwise the default Expo Metro config.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
