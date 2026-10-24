# Security

## How data is protected

- All data is stored in a SQLite database encrypted with SQLCipher. The 256-bit key is generated
  on the device and kept in the Android Keystore / iOS Keychain with "this device only"
  accessibility, so it is never included in a backup or moved to another device.
- An optional app lock requires Face ID, fingerprint or the device passcode on launch and after
  30 seconds in the background. While the app is not in front, its content is covered so balances
  do not show in the app switcher. With the lock on, the Android widget shows no amounts.
- The app has no accounts, no server and no analytics service. It makes two kinds of network
  request, both limited to what they need:
  - Exchange rates, only when a purchase is recorded in a currency other than the home currency:
    a request to api.frankfurter.dev containing the two currency codes and the date, nothing
    else. Each rate is stored on the device and not requested again.
  - Optional crash reporting, off by default, which must be turned on by the user and sends the
    error and stack trace only (no amounts, notes, merchants, screenshots or breadcrumbs).
- Receipt text is read on the device (Apple Vision on iOS, Google ML Kit on Android). The photo
  is not uploaded.
- Receipt photos are files in the app's private documents folder, protected by the operating
  system's app sandbox and file protection but not by SQLCipher. They are not included in
  backups. Photos no longer attached to a transaction are deleted on the next app start.
- Exported CSV and backup files are not encrypted; the app says so when creating a backup.

## Dependency audit

CI runs `npm run audit` (`scripts/audit.mts`), which fails on any high or critical advisory in
production dependencies. Two advisories are excepted because the affected code runs only in the
Expo command-line tools on the build machine and is not part of the app bundle:

- GHSA-86w9-cpqp-85rv (node-forge, used by `@expo/cli` and the `expo-updates` code-signing
  tool; no fixed release exists).
- GHSA-mrhx-c7xc-m3w5 (zod 3 inside `expo`; the app itself uses zod 4.6.7, which is fixed).

Each exception is limited to that package path, so the same advisory elsewhere fails the build.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's "Report a vulnerability"
form on this repository's Security tab. Do not open a public issue. Reports are acknowledged
within seven days.

## Scope

In scope: handling of imported files (CSV and backup parsing), exported files, local data
storage (including receipt photos), the exchange rate request, the app lock, deep links and
notification content.

Out of scope: issues that require a rooted or jailbroken device, or physical access to an
unlocked phone.
