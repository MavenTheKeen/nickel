# Accessibility

## What's in place

Buttons, toggles and category tiles have labels and roles, and selected or disabled state is
exposed to screen readers. A transaction row reads as one sentence (merchant, expense or
income, amount and date) instead of four separate pieces.

The charts have text equivalents: the donut lists each category with its amount, and the trend
chart lists each month. Everything you can tap on a chart is also available as a normal list
row. Budget rows say "nearly at limit" or "over budget" in words, so colour is never the only
signal.

Validation errors, the quick add preview and status messages are polite live regions, so they're
announced as they change. Swipe to delete has a button alternative on the edit screen. The month
review is a set of cards, and its page indicator is an adjustable control, so swiping up or down
with a screen reader moves between cards.

Touch targets are at least 44 × 44 points. Text follows the system font size everywhere (nothing
sets `allowFontScaling={false}`), and text colours meet 4.5:1 contrast in both themes. When
reduce motion is on, the counting amounts, sliding progress bars and loading pulse are all
skipped. With the app lock on, the content behind the lock screen is hidden from screen readers.

## Still to test on a device

I haven't gone through these with TalkBack or VoiceOver yet:

- Adding a transaction using only the screen reader
- Deleting and undoing without swiping
- Unlocking the app lock with the screen reader on
- Importing a CSV and hearing the validation summary
- Moving through the month review
- The largest system text size on Home and the add screen (nothing should be cut off)
