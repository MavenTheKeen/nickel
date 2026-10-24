# Accessibility

## Implemented

- Every button, toggle, segmented control and category tile has an accessibility label and role;
  selected and disabled states are exposed (`accessibilityState`).
- Transaction rows read as one sentence: merchant, expense or income, amount and date.
- Charts expose their data as text: the donut lists each category and amount, the trend lists
  each period and amount.
- Progress bars expose their value (0-100) as a progress bar role.
- Validation errors and status messages use a polite live region, so they are announced.
- Touch targets are at least 44 by 44 points; hit slop is added to small icons.
- Text uses the system font size; no text sets `allowFontScaling={false}`.
- Swipe to delete has an alternative: Delete on the edit screen.
- Colour is never the only signal: budget rows say "nearly at limit" and "over budget" in text.
- Light and dark themes; text colours meet 4.5:1 contrast against their background.
- With the app lock on, the content behind the lock screen is hidden from screen readers.
- Nickel's own animations (counting amounts, sliding progress bars, the loading placeholder) are
  skipped when the system reduce motion setting is on. Animated amounts announce their final value
  only.
- Chart slices and bars can be tapped, but every figure is also available as a list row or as the
  chart's text label, so nothing depends on hitting a slice.
- The review cards are read one at a time; the page indicator is an adjustable control, so
  swiping up or down with a screen reader moves between cards.
- The quick add preview is a polite live region: the reading of the typed line is announced.
- Receipt photos have a label and open full screen; camera and photo access explain why they are
  needed.

## Device checklist

Not yet run on a device. Record the result and date for each.

| Check                                                                    | Android (TalkBack) | iOS (VoiceOver) |
| ------------------------------------------------------------------------ | ------------------ | --------------- |
| Add a transaction using only the screen reader                           |                    |                 |
| Every control on Home, Budgets, Insights and Bills is announced sensibly |                    |                 |
| Delete and undo a transaction without swiping                            |                    |                 |
| Largest system text size: no clipped text on Home and the add screen     |                    |                 |
| Unlock the app lock with the screen reader on                            |                    |                 |
| Import a CSV and hear the validation summary                             |                    |                 |
| Quick add an expense and hear the preview                                |                    |                 |
| Move through the period review with the screen reader                    |                    |                 |
| Reduce motion on: no counting amounts or sliding bars                    |                    |                 |
