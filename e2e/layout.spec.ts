import { expect, test } from '@playwright/test';

test.describe('Auth Gate Smoke', () => {
  test('renders the invite-only auth shell on the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible();
    await expect(page.locator('.crt')).toBeVisible();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.hud-corner.tl')).toBeVisible();
    await expect(page.locator('.hud-corner.tr')).toBeVisible();
    await expect(page.locator('.hud-corner.bl')).toBeVisible();
    await expect(page.locator('.hud-corner.br')).toBeVisible();
    await expect(page.locator('.retro-grid')).toBeVisible();
    await expect(page.locator('.retro-sun')).toBeVisible();
    await expect(page.locator('.crt-overlay')).toBeVisible();
    await expect(page.locator('.scanline')).toBeVisible();
    await expect(page.getByText(/invite-only beta/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /interview simulator/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
    await expect(
      page.getByText(/if you were invited by email, use that same email when the netlify identity modal opens/i),
    ).toBeVisible();
  });
});
