import { expect, test } from '@playwright/test'

test('Mind Focus Mode can be enabled and shows controls', async ({ page }) => {
  await page.goto('/heap')
  await expect(page.getByTestId('heap-canvas-container')).toBeVisible()
  await page.getByRole('button', { name: /focus mode/i }).click()
  await expect(page.getByRole('button', { name: /focus mode/i })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/focused:/i).first()).toBeVisible()
})
