# Releasing

Builds are made with EAS Build; JavaScript-only fixes ship with EAS Update. Both need an Expo
account; run `npx eas-cli@latest login` and, once, `npx eas-cli@latest init` to link the project
(this writes `extra.eas.projectId` and the updates URL into the app config).

## Build profiles (eas.json)

| Profile       | What it is                                      | Channel       |
| ------------- | ----------------------------------------------- | ------------- |
| `development` | Development client; APK and iOS simulator build | `development` |
| `preview`     | Release build installed directly (APK)          | `preview`     |
| `e2e`         | Release build for running the Maestro flows     | `e2e`         |
| `production`  | Store build; version code incremented by EAS    | `production`  |

```sh
npx eas-cli@latest build --profile preview --platform android
```

## Updates

`runtimeVersion` uses the fingerprint policy: any change to native code or config plugins gives a
new runtime version, and an update is only delivered to builds with the same runtime. A
JavaScript change can be shipped without a store release:

```sh
npx eas-cli@latest update --channel preview --message "Fix budget rounding"
```

The app checks for an update on launch. When one has downloaded, Settings shows "Restart to
update"; otherwise it applies on the next cold start. The channel and update id appear next to
the version line in Settings.

For a release I publish to `preview` first, check it on a device, then publish the same commit to
`production`.

## Rolling back

If an update misbehaves, republish the previous update to the channel, or roll back to the code
embedded in the build:

```sh
npx eas-cli@latest update:rollback --channel production
```

Devices pick up the rollback on their next launch. Because the database is migrated forward on
launch, an update that adds a migration cannot be rolled back to code that predates it: the app
refuses to open a database newer than itself. Ship migrations in a store build, not in an update.

## Crash reporting

Set `EXPO_PUBLIC_SENTRY_DSN` as an EAS environment variable to include Sentry in a build, and
`SENTRY_AUTH_TOKEN` (secret) to upload source maps. Without the DSN the Sentry code does nothing,
and even with it, users must opt in under Settings > Privacy.
