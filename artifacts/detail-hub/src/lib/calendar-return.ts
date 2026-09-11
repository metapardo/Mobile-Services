/**
 * Shared by `booking-new.tsx` and `booking-detail.tsx`: `calendar.tsx` tags
 * every link it sends a visitor out on (to create or view a booking) with
 * `?view=day|week|month&returnDate=YYYY-MM-DD` — the view mode and anchor
 * date the visitor was looking at. Both booking pages read that back here to
 * decide where "back to calendar" (a cancel, a save, a delete, the header
 * back link) actually goes, instead of hardcoding `/calendar` and losing
 * whatever view/date the visitor came from.
 */
export function getCalendarReturnPath(search: string): string {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const returnDate = params.get('returnDate');
  if ((view === 'day' || view === 'week' || view === 'month') && returnDate && /^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
    return `/calendar?view=${view}&date=${returnDate}`;
  }
  return '/calendar';
}
