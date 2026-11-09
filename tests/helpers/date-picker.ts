import { expect, type Locator, type Page } from '@playwright/test';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Drives the shared date picker (`src/components/date-picker.tsx`) the way a
 * person does: open it, turn to the month, click the day. `trigger` is the
 * picker's button; leave it out when the picker is already open (the List's
 * cell editor opens on its own).
 */
export async function pickDate(page: Page, iso: string, trigger?: Locator): Promise<void> {
  if (trigger) await trigger.click();
  const picker = page.locator('[data-slot=popover-content]');
  await expect(picker).toBeVisible();
  const [year, month] = iso.split('-');
  await picker.getByRole('combobox', { name: 'Choose the Year' }).selectOption(year!);
  await picker.getByRole('combobox', { name: 'Choose the Month' }).selectOption({ label: MONTHS[Number(month) - 1]! });
  await picker.locator(`button[data-day="${iso}"]`).click();
  await expect(picker).toHaveCount(0);
}

/** The picker's trigger, found by the label it is read with. */
export const datePicker = (scope: Page | Locator, label: string): Locator =>
  scope.getByRole('button', { name: new RegExp(`^${label}(,|\\s|$)`) }).and(scope.locator('[data-slot=date-picker]'));
