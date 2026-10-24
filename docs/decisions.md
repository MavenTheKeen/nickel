# Decisions

Each entry records a choice, the reason for it, and what was given up.

## Local-only data

All data is stored in SQLite on the device. There is no server, account or sync.

Reason: the project's purpose is the app itself (data layer, UI, tests, instrumentation), and a
backend would add credentials, hosting and personal financial data in transit without improving
any of those. Trade-off: no sync or multi-device use; data moves between phones through the
backup file.

## Integer cents

Amounts are stored as integers in cents. Expenses are negative and income positive. Parsing works
on the digits of the input string, never through `parseFloat`.

Reason: binary floats cannot represent most decimal amounts, so sums drift by fractions of a cent.
The schema enforces `typeof(amount_cents) = 'integer'` so a float cannot be stored by mistake.
Formatting happens only in `MoneyText` and `formatCents`.

## Calendar dates as strings

Dates are stored as `YYYY-MM-DD` in the user's local calendar; months as `YYYY-MM`. Day arithmetic
uses UTC, which has no daylight saving.

Reason: a transaction happens on a calendar day, not at an instant. Storing timestamps would move
a purchase to the previous or next day after a time zone change or around a daylight saving
transition. Notifications are built from local wall-clock parts and rescheduled on every start,
so a time zone change takes effect the next time the app opens.

## Hand-written SQL behind repositories

Queries are plain SQL in `src/db/repositories`, typed at the row and domain level. Drizzle ORM was
considered.

Reason: the aggregate queries (spending by category, 12-month totals, top merchants) are the
interesting part, and writing them directly keeps the index usage visible; one test checks the
query plan uses the date index. The repositories depend on a four-method `Db` interface, which the
app backs with expo-sqlite and the tests back with `node:sqlite`, so database tests run against a
real engine with no native build. Trade-off: no generated types from the schema, so row interfaces
are maintained by hand.

## Serialized database access

`createSerialDb` runs every statement in order and holds the queue for the whole of a transaction.

Reason: expo-sqlite's `withTransactionAsync` is not exclusive. Without a queue, an unrelated write
issued while a transaction awaits would run inside it and be lost if that transaction rolled back.
A test reproduces that case. Trade-off: reads wait behind writes; with one user this is not
measurable.

## Numbered, frozen migrations

Each schema change is a new numbered file; released files are not edited. The runner applies each
pending migration and its `user_version` bump in one transaction, and refuses a database from a
newer app version.

Reason: a failed migration leaves the database at the last good version, and running migrations
twice is a no-op. Migration 002 is tested by upgrading a version 1 database that holds data.

## Archive instead of delete for categories

A category with transactions cannot be deleted (foreign key `ON DELETE RESTRICT`, and a friendly
check in the repository); it can be archived.

Reason: deleting it would orphan or delete history. Archived categories are hidden from pickers and
from "copy last month's budgets", but past transactions still show their category.

## Recurring rules are computed from the anchor date

A rule stores its first date and the index of the next occurrence. Each occurrence is computed from
the anchor, not from the previous occurrence.

Reason: stepping from the previous date makes a bill on the 31st drift to the 28th after February
and stay there. Computing from the anchor clamps only the short months. Due bills are generated on
app start; the inserts and the rule update commit together, so a crash cannot create a bill twice.

## One shared validation schema

The add/edit form and every CSV row pass through the same Zod schema (`transactionSchema`).

Reason: a rule such as "no dates more than a year ahead" exists in one place and gives the same
message in both paths. A small Zod resolver for React Hook Form is included instead of
`@hookform/resolvers`, whose optional peer dependencies could not be installed alongside this
project's packages.

## Instrumentation without a backend

Events are written through one `track()` function to an append-only `events` table, capped at
20,000 rows. Timings are events too. The debug screen exports the log as JSON.

Reason: a single entry point keeps the vocabulary small (eleven event names) and makes it impossible
for instrumentation to break a feature: sink errors are swallowed and events before the database
opens are buffered. Trade-off: data leaves the device only when the user exports it.

## Deterministic experiment assignment

Variant = FNV-1a hash of `flagKey:installId`, mod 100, against cumulative weights. The first
assignment is stored.

Reason: no server is needed to keep a user in one variant, and including the flag key makes
separate experiments independent. Storing the first assignment means changing weights later does
not move existing installs.

## Plain SVG charts

The donut and bar charts are drawn with react-native-svg directly rather than a chart library.

Reason: two simple charts did not justify a library's bundle size and startup cost, and the
drawing code is small enough to test.

## Dependency versions

Every dependency is pinned to an exact version (`save-exact`), Node is pinned in `.nvmrc`, and CI
actions are pinned by commit. Dependabot proposes patch updates only.

Reason: Expo SDK packages must move together; a minor bump of one package can break the native
build. SDK upgrades are done deliberately with `npx expo install --fix`.

## Encryption at rest with SQLCipher

The database file is encrypted with SQLCipher. The key is 32 random bytes, stored in the Keystore
or Keychain with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, and passed as a raw hex key so SQLCipher
skips its passphrase derivation on every open.

Reason: financial data on a lost phone should not be readable from the file system or a device
backup. "After first unlock" lets the background task and the widget open the database while the
phone is locked; "this device only" keeps the key out of backups. Trade-off: restoring a device
backup to a new phone cannot open the database, so moving phones goes through the app's own
backup file. Expo Go ships plain SQLite, so the app runs unencrypted there and reports this on the
debug screen.

## App lock rules as a pure function

When to lock is decided by `lockPolicy.ts` (cold start, or 30 seconds or more in the background;
system prompts and the app switcher do not count), separately from the component that shows the
lock screen.

Reason: the rules are easy to get subtly wrong (the Face ID prompt itself makes the app inactive)
and are tested without a device. The automatic prompt is shown once per return from the
background so a cancelled prompt does not reopen in a loop. The device passcode is accepted as a
fallback, so the lock works on phones without enrolled biometrics.

## One database connection per process

The app, the background refresh task and the Android widget handler all use `getDeviceDb()`, a
single shared connection behind the serial queue.

Reason: the background task and widget can run while the app is open. Two connections would each
have their own queue, and their writes could interleave inside each other's transactions.

## Background refresh

A periodic background task (`expo-background-task`, at most every 12 hours, scheduled by the OS)
runs the same code as an app start: create bills that fell due and rebuild the notification plan.

Reason: without it, a bill due while the app is closed is not recorded and the weekly summary
reflects spending as of the last app open. The OS decides when the task runs, so this narrows the
gap rather than closing it; app start still does the same work.

## Budget periods with a start day

Budgets can reset on any day from the 1st to the 28th. A period is named after the month it starts
in; a date belongs to the period of the month containing `date - (startDay - 1) days`. The same
rule runs in TypeScript (`periodOf`) and SQL (`strftime('%Y-%m', date, '-N days')`).

Reason: many people budget from payday. Days 29 to 31 are excluded because February would need
special cases. Existing data needs no migration: periods are computed at query time.

## Backup format

A backup is one JSON file with a format name, a format version, the schema version and every user
table. It is validated row by row with Zod before anything is written, then restored in one
transaction with original ids, followed by a foreign key check.

Reason: a partial restore would leave the data inconsistent; keeping ids keeps links between
transactions, categories, bills and import batches. Events, flags and the install id are not
included because they describe the install, not the user's data. A backup from a newer schema is
refused with a message.

## FlashList behind a switch

The transaction list uses FlashList by default; a `transaction_list` flag set to 100/0 lets the
debug screen force FlatList. Both record `list_first_render`.

Reason: the choice should be made on measurements from a real device with 10,000 rows, not on
reputation, and the existing flag system makes the comparison a two-tap switch.

## Opt-in crash reporting

Sentry is included only when the build has a DSN, and sends nothing until the user turns on
"Send crash reports". Breadcrumbs, screenshots and the view hierarchy are disabled.

Reason: the app promises that data stays on the device. Breadcrumbs and accessibility labels
contain amounts and merchants, so they are dropped rather than scrubbed.

## Native-only features degrade in Expo Go

Modules that Expo Go does not include (quick actions, the widget, Sentry's native layer) are loaded
lazily through `optionalModule`, and SQLCipher and background tasks are skipped there.

Reason: the app should still open in Expo Go for a quick look. The features are present in
development and release builds.

## Android widget only, for now

The home screen widget is implemented for Android with react-native-android-widget, which renders
the widget from a JavaScript tree in a headless task. An iOS widget needs a WidgetKit extension in
Swift and an App Group to share data, which requires a paid Apple developer account.

## Expo SDK 57

The project uses SDK 57, one release behind the newest.

Reason: the Expo Go app in the App Store did not yet support SDK 58, and Expo Go is the quickest
way to open the app on an iPhone without a paid Apple developer account. The move back required
two code changes (a widened colour-scheme type and one Sentry option that SDK 57's Sentry does not
have), Jest 29 instead of 30, and a test renderer pinned to the React 19.2 reconciler. Moving to
SDK 58 later is `npx expo install expo@58 --fix` followed by the full test run.

## Merchant keys for rules and history

Rules, category suggestions and bill detection compare merchants by a key: lower case, accents,
punctuation and any word containing a digit removed, and card-processor words ("SQ", "POS",
"purchase") dropped. "STARBUCKS #1234" and "Sq \*Starbucks" both become "starbucks". A rule
matches when its pattern appears as whole words in the key; the longest pattern wins.

Reason: bank exports add store numbers, terminal codes and processor prefixes that change between
purchases, so exact matching misses most repeats. Whole-word matching keeps "store" from matching
"superstore". Trade-off: two shops whose names differ only in a number ("7-Eleven" and "Eleven")
look the same; a rule can be edited to be more specific.

## Learning categories from corrections

When no rule matches, the category suggested for a merchant is the one it was filed under most
often, if at least twice and more often than any other. When the user files a merchant somewhere
other than the suggestion, or changes the category of an existing transaction, the app offers to
make a rule and, if earlier transactions are filed elsewhere, to move them.

Reason: the user's own history is the best predictor, and asking once is cheaper than asking on
every transaction. A rule is visible and editable on the Category rules screen, unlike an
inferred preference. Refiling the past is offered, never automatic, and never moves income into
an expense category or the reverse.

## Bill detection

Past transactions are grouped by merchant key and direction (money out or in), amounts within 15%
or $2 of the group median are kept, and the unbroken run of regular gaps ending at the latest
payment is measured: 6-8 days for weekly (four payments), 26-35 days for monthly (three) and
355-375 days for yearly (two). A series whose last payment is more than one and a half periods
ago is treated as stopped. Merchants that already have a bill, were dismissed, or have a
transaction linked to a bill are skipped.

Reason: the gap ranges absorb weekends and short months; requiring a run ending at the latest
payment ignores a merchant that was regular a year ago but not now. An accepted suggestion starts
at the first expected date after today, so a payment already recorded is never generated again.
Trade-off: a bill whose amount changes by more than 15% splits into two series until the new
amount has repeated enough times.

## Rollover budgets

A category with rollover on spends against its limit plus a carry: the sum of limit minus
spending over the unbroken run of budgeted periods before this one. Overspending carries as a
negative amount. A period without a limit resets the carry. The carry is computed when read, in
`budgetLines`, so Home, budget warnings, the widget and the review all use the same figure.

Reason: computing instead of storing the carry means editing an old transaction or limit
corrects every later period with no stored balance to keep in step. With one query per screen for
the history of rollover categories only, the cost is small. Trade-off: there is no cap on how
much can accumulate.

## Goals outside the transactions table

Savings goals have their own contributions table. Adding money to a goal does not create a
transaction and does not affect spending, budgets or safe to spend.

Reason: setting money aside is a transfer, not spending. Recording it as an expense would make
the month look more expensive and a withdrawal would look like income. "On track" compares the
amount saved with a straight line from the goal's creation date to its target date; the monthly
amount is the remainder divided over the months left, counting the current month, rounded up.

## Quick add grammar

One line of text becomes a transaction: the first number is the amount (a leading "+" makes it
income), "today", "yesterday", a weekday or an ISO date sets the date, a category name or a unique
prefix of at least three letters picks the category, and the rest is the merchant. The preview
under the field shows how the line was read before anything is saved, and the result passes
through the same schema as the form and the importer.

Reason: a fixed, small grammar is predictable and can be tested exhaustively, where free-form
language parsing would guess. Words are matched regardless of order, so "loblaws 12 groc" works.
Trade-off: a merchant whose name is a category name ("Fun Haus") is read as the category; the
full form is one tap away for those cases.

## Receipt photos as files

Photos are copied into the app's documents folder and the transaction stores only the file
name. Unreferenced photos are deleted on the next app start, which is after the undo window for a
delete. Photos are not part of the JSON backup.

Reason: images in SQLite would make the encrypted database and every backup many times larger,
and the absolute path of the documents folder changes between app updates on iOS, so only the
name is stored. Trade-off: photos are protected by the operating system's file protection rather
than SQLCipher, and moving to a new phone through a backup loses them; the app says so.

## The period review

The review is a set of cards built by a pure function from figures the reports already compute:
total and change from the period before, the category that changed most (at least $10), the top
merchant, budgets kept, the busiest weekday, the largest expense and money put towards goals.
Cards with nothing to say are left out. Home offers the review during the first week of the next
period until it is opened or dismissed.

Reason: the review reuses tested queries rather than adding new ones, and building it as data
makes each card testable without rendering. It can be shared as plain text, which carries no
image of the user's screen.

## Motion

Headline amounts count to their new value and progress bars slide when data changes after a
save, but not when a screen opens, so navigation is never slowed by an animation. Loading shows
placeholder rows in the shape of the content. All animations jump to their end state when the
system's reduce motion setting is on.

Reason: movement shows what changed after an action; on first display it only delays reading.
Core `Animated` is used rather than Reanimated so components render the same way under Jest.

## Foreign currency: convert once, keep the original

A purchase in another currency is converted to the home currency when it is recorded and stored
like any other transaction; the amount as paid, its currency and the rate used are kept beside it
for display and editing. Rates are stored as integers in millionths and conversion multiplies in
`BigInt`, rounding half away from zero. Rates come from Frankfurter's free API, which needs no
key; a rate for a past date is requested once and stored, today's rate is stored under today, and
when the phone is offline the newest stored rate for the pair is offered with a note, or the user
types the rate.

Reason: storing every amount in one currency means budgets, reports, the widget and the review
need no currency logic at all. Converting at the day's rate matches what a card statement shows
closely enough for budgeting, and keeping the original lets the user correct the rate later.
The request carries only two currency codes and a date, which keeps the promise that personal
data stays on the phone. Trade-off: changing the home currency later does not convert past
amounts; the app says so before the change.

## Receipt reading on the device

When a receipt photo is attached, the text is recognised on the device (expo-text-extractor:
Apple Vision on iOS, Google ML Kit on Android) and a pure function finds the total, the date and
the shop name. The result is shown as a suggestion with "Use these"; nothing in the form changes
until the user taps it. Expo Go does not include the native module, so the suggestion only
appears in development and release builds.

Reason: an on-device model keeps photos off any server, works offline and costs nothing per
receipt. Receipts vary too much for any parser to be always right, so the reading is offered, not
applied. The parser prefers "grand total", then "amount due", then "total", skips subtotal, tax
and tip lines, reads the amount from the next line when labels and amounts are in two columns,
and ignores dates in the future or more than a year old (expiry and membership dates).
