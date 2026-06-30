import { expect, test } from '@playwright/test';

test.describe('Auth Gate Smoke', () => {
  test('renders the invite-only auth shell on the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('auth-screen')).toBeVisible();
    await expect(page.locator('.authGateCard')).toBeVisible();
    await expect(page.getByText(/invite-only beta/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /lern2cwd/i })).toBeVisible();
    await expect(page.getByText(/sign in with an invited email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /join waitlist/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /sign up/i })).toHaveCount(0);
  });

  test('keeps the invite-only auth shell usable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByTestId('auth-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /lern2cwd/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /log in/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /join waitlist/i })).toBeVisible();
    await expect(page.getByTestId('auth-submit-button')).toBeVisible();
  });

  test('renders the guest demo landing page from the single demo link', async ({ page }) => {
    await page.goto('/try/demo');

    await expect(page.getByTestId('guest-demo-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /lern2cwd/i })).toBeVisible();
    await expect(page.getByText(/Practice online coding interviews and answering behavioral interview questions/i)).toBeVisible();
    await expect(page.getByText(/no account needed/i)).toBeVisible();
    await expect(page.getByText(/This app uses/i)).toBeVisible();
    await expect(page.getByText(/advanced cognitive psychology/i)).toBeVisible();
    await expect(page.getByText(/soy dev ---> fully cracked fast/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /pubmed/i })).toHaveCount(0);
    await expect(page.getByTestId('guest-demo-submit')).toBeVisible();
    await page.getByRole('button', { name: /advanced cognitive psychology behind/i }).click();
    const dialog = page.getByRole('dialog', { name: /advanced cognitive psychology/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('columnheader', { name: /principle/i })).toBeVisible();
    await expect(dialog.getByRole('cell', { name: /The learner has to produce an answer/i })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /pubmed/i }).first()).toHaveAttribute(
      'href',
      'https://pubmed.ncbi.nlm.nih.gov/16507066/',
    );
    await expect(page.getByText(/not claiming clinical or educational outcome guarantees/i)).toBeVisible();
  });

  test('keeps the guest demo landing page scrollable at phone height', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto('/try/demo');

    const guestDemoScreen = page.getByTestId('guest-demo-screen');
    await expect(guestDemoScreen).toBeVisible();

    const metrics = await guestDemoScreen.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        overflowY: styles.overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });

    expect(metrics.overflowY).toMatch(/auto|scroll/);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await page.getByTestId('guest-demo-submit').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('guest-demo-submit')).toBeVisible();
  });

  test('starts a local guest demo when the Netlify function is unavailable in Vite dev', async ({ page }) => {
    const leadSubmissions: string[] = [];

    await page.route('**/.netlify/functions/guest-session', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: 'Not found in Vite dev',
      });
    });
    await page.route('**/__forms.html', async (route) => {
      if (route.request().method() === 'POST') {
        leadSubmissions.push(route.request().postData() ?? '');
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>forms</title>',
      });
    });

    await page.goto('/try/demo');
    await page.getByLabel(/email/i).fill('recruiter@example.com');
    await page.getByTestId('guest-demo-submit').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home-view')).toBeVisible();

    const storedSession = await page.evaluate(() => localStorage.getItem('lern2cwd-guest-demo-session'));
    expect(storedSession).toContain('local-dev-guest.demo.recruiter%40example.com');

    expect(leadSubmissions).toHaveLength(1);
    const leadSubmission = new URLSearchParams(leadSubmissions[0]);
    expect(leadSubmission.get('form-name')).toBe('guest-demo-start');
    expect(leadSubmission.get('email')).toBe('recruiter@example.com');
    expect(leadSubmission.get('code')).toBe('demo');
  });
});
