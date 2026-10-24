# Design decisions

Notes on why some things are built the way they are, and what each choice costs.

## No server

Everything is stored in SQLite on the phone. A backend would have meant accounts, hosting and
people's financial data going over the network, and none of that would make the app itself any
better. The cost is no sync: to move to a new phone you export a backup file and restore it.

The app does make one kind of request on its own: exchange rates from Frankfurter, which only
receive two currency codes and a date. Crash reporting exists but is off unless the user turns it
on.

## Money as integer cents

Amounts are integers in cents, negative for spending and positive for income. Input is parsed
digit by digit from the string, so `0.1 + 0.2` problems can't happen, and the table has a
`CHECK (typeof(amount_cents) = 'integer')` so a float can't be stored even by mistake.

Exchange rates follow the same idea. They are stored as integers in millionths, and conversion
multiplies with `BigInt` and rounds half away from zero.

## Dates as calendar days

Dates are stored as `YYYY-MM-DD` strings in the user's local calendar, and day arithmetic is done
in UTC. A purchase happens on a day, not at an instant. If I stored timestamps, a coffee bought
at 11pm could move to the next day after flying somewhere or around a daylight saving change.

## Plain SQL instead of an ORM

I looked at Drizzle but went with hand-written SQL in `src/db/repositories`. The interesting
queries are aggregates (spending by category, 12-month totals, top merchants), and I wanted to
see exactly what runs and which index it uses. One test checks the query plan.

The repositories only depend on a small `Db` interface with four methods. The app implements it
with expo-sqlite and the tests with Node's built-in `node:sqlite`, so database tests hit a real
engine without a native build. The downside is that row types are written by hand.

## A queue in front of the database

This one is easy to miss. expo-sqlite's `withTransactionAsync` doesn't lock anything: if another
write comes in while a transaction is waiting on an `await`, it runs inside that transaction, and
it disappears if the transaction rolls back. `createSerialDb` runs statements one at a time and
holds the queue for the whole transaction. There's a test that reproduces the original problem.

The background task and the Android widget can run while the app is open, so they all share the
same connection and queue.

## Migrations

Each schema change is a new numbered file, and released files don't get edited. A migration and
its `user_version` bump commit together, so a failure leaves the database at the last good
version. The app refuses to open a database from a newer version of itself. Upgrades are
tested on databases that already contain data.

## Encryption

The database is encrypted with SQLCipher using a random 32-byte key stored in the Keystore or
Keychain as `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. "After first unlock" is needed because the
widget and the background task open the database while the phone is locked. "This device only"
keeps the key out of cloud backups. That means restoring an iCloud or Google backup on a new
phone won't open the database, which is why the app has its own backup file.

Expo Go ships plain SQLite, so the app runs unencrypted there. The debug screen shows which one
is in use.

## Recurring bills

Each occurrence is calculated from the bill's start date rather than from the previous
occurrence. Otherwise a bill on the 31st becomes the 28th after February and stays there. Bills
that are due get created on app start (and by a background task when the OS allows it), and the
inserts commit together with the rule update, so a crash can't create the same bill twice.

## Budget periods that start on any day

The budget month can start on any day from the 1st to the 28th. A date belongs to the period of
`date - (startDay - 1) days`, and the same rule exists in TypeScript and in SQL
(`strftime('%Y-%m', date, '-N days')`). Nothing is stored per period, so changing the start day
needs no migration. I left out 29 to 31 to avoid special cases for February.

Rollover works the same way: the carried amount is calculated when the budget is read, from the
run of earlier periods that had a budget. If an old transaction gets edited, every later month
is already right, because there's no stored balance to fix.

## Merchant names

Bank exports are messy: `STARBUCKS #1234`, `SQ *STARBUCKS`, `POS PURCHASE STARBUCKS`. Rules,
category suggestions and bill detection all compare a cleaned-up key instead: lower case, no
accents or punctuation, words with digits dropped, processor words like "sq" and "pos" removed.
All three of those become `starbucks`. Rules match whole words, so "store" doesn't match
"superstore", and the longest matching rule wins.

## Detecting bills from history

Transactions are grouped by merchant key, outliers more than 15% (or $2) from the median are
dropped, and the gaps between payments are checked: 6-8 days for weekly, 26-35 for monthly,
355-375 for yearly. It needs four, three and two regular payments respectively, ending with the
most recent one, so something that was monthly a year ago but stopped isn't suggested. The weak
spot is a price increase over 15%, which splits a subscription into two series for a while.

## Validation in one place

The add form, quick add and every imported CSV row go through the same Zod schema, so a rule like
"no dates more than a year ahead" gives the same message everywhere. I wrote a small Zod resolver
for React Hook Form instead of using `@hookform/resolvers`, because its optional peer
dependencies conflicted with the project's packages.

## Charts without a library

The donut and bar charts are drawn directly with react-native-svg. Two simple charts weren't
worth a charting library's bundle size, and the drawing code is small enough to test.

## Pinned dependencies

Every dependency is pinned to an exact version, Node is pinned in `.nvmrc`, and GitHub Actions
are pinned by commit. Expo packages have to move together, and a stray minor bump can break the
native build, so SDK upgrades go through `npx expo install --fix` on purpose.

The project is on SDK 57 rather than 58 because the App Store version of Expo Go didn't support
58 yet, and Expo Go is the easiest way to run it on an iPhone without a paid developer account.

## Experiments without a server

Feature flags assign a variant from an FNV-1a hash of `flagKey:installId`, mod 100. The same
install always gets the same variant, and including the flag key keeps experiments independent
of each other. The first assignment is saved, so changing the weights later doesn't move people
who are already in the experiment. Events go to a local table through a single `track()`
function that never throws, so analytics can't break a feature.
