# Security

## How data is stored

The database is SQLite encrypted with SQLCipher. The 256-bit key is generated on the phone and
kept in the Android Keystore or iOS Keychain, marked "this device only", so it never ends up in a
cloud backup.

There's an optional app lock (Face ID, fingerprint or the device passcode). It asks on launch and
after 30 seconds in the background, and the app's content is hidden in the app switcher. With the
lock on, the Android widget doesn't show amounts.

Receipt photos are stored as files in the app's private folder. They're protected by the OS
sandbox, not by SQLCipher, and they aren't included in backups. Receipt text is recognised on the
phone; photos are never uploaded.

CSV exports and backup files are not encrypted. The app warns about this when you make a backup.

## Network requests

There are no accounts, no server and no analytics service. The app only makes two kinds of
request:

- Exchange rates from api.frankfurter.dev, only when you record something in another currency.
  The request contains two currency codes and a date. Each rate is cached so it's only fetched
  once.
- Crash reports through Sentry, which are off by default. If you turn them on, only the error and
  stack trace are sent. Breadcrumbs, screenshots and the view hierarchy are disabled because they
  would include amounts and merchant names.

## Dependency audit

CI runs `npm run audit` ([scripts/audit.mts](scripts/audit.mts)) and fails on any high or
critical advisory in production dependencies, with two exceptions. Both are in Expo's
command-line tools, which only run on the build machine and aren't part of the app:

- GHSA-86w9-cpqp-85rv in node-forge, used by `@expo/cli` and the `expo-updates` signing tool.
  There's no fixed version yet.
- GHSA-mrhx-c7xc-m3w5 in the copy of zod 3 bundled inside `expo`. The app itself uses zod 4.6.7,
  which has the fix.

Each exception only applies to that package path, so the same advisory anywhere else still fails
the build.

## Reporting a problem

Please use GitHub's private "Report a vulnerability" form on the Security tab rather than opening
a public issue. I'll reply within a week.

Worth reporting: anything around importing or exporting files, how data is stored, the exchange
rate request, the app lock, deep links or notification content. Issues that need a rooted or
jailbroken phone, or someone holding your unlocked phone, are out of scope.
