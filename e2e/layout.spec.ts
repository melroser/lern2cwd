import { test, expect } from '@playwright/test';

test.describe('Layout Height Propagation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to be ready
    await page.waitForSelector('.app', { state: 'visible' });
    
    // Handle settings modal if it appears (first launch)
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    const isVisible = await settingsModal.isVisible().catch(() => false);
    
    if (isVisible) {
      // Add a dummy API key to dismiss the modal
      const apiKeyInput = page.locator('input[type="password"]');
      await apiKeyInput.fill('test-api-key-for-e2e-testing');
      
      const saveButton = page.locator('button:has-text("Save")');
      await saveButton.click();
      
      // Wait for modal to close
      await page.waitForSelector('[data-testid="settings-modal"]', { state: 'hidden' });
    }
  });

  test('should have correct DOM structure with all wrappers', async ({ page }) => {
    // Verify the critical wrapper hierarchy exists
    const app = page.locator('.app');
    await expect(app).toBeVisible();

    const crt = page.locator('.crt');
    await expect(crt).toBeVisible();

    const shell = page.locator('.shell');
    await expect(shell).toBeVisible();

    // Verify HUD corners exist
    await expect(page.locator('.hud-corner.tl')).toBeVisible();
    await expect(page.locator('.hud-corner.tr')).toBeVisible();
    await expect(page.locator('.hud-corner.bl')).toBeVisible();
    await expect(page.locator('.hud-corner.br')).toBeVisible();

    // Verify background elements exist
    await expect(page.locator('.retro-grid')).toBeVisible();
    await expect(page.locator('.retro-sun')).toBeVisible();
    await expect(page.locator('.crt-overlay')).toBeVisible();
    await expect(page.locator('.scanline')).toBeVisible();
  });

  test('should have 100% height propagation chain', async ({ page }) => {
    // Check html/body/#root have 100% height
    const html = page.locator('html');
    const htmlHeight = await html.evaluate((el) => 
      window.getComputedStyle(el).height
    );
    expect(htmlHeight).not.toBe('auto');

    const body = page.locator('body');
    const bodyHeight = await body.evaluate((el) => 
      window.getComputedStyle(el).height
    );
    expect(bodyHeight).not.toBe('auto');

    const root = page.locator('#root');
    const rootHeight = await root.evaluate((el) => 
      window.getComputedStyle(el).height
    );
    expect(rootHeight).not.toBe('auto');

    // Check .app has 100% height
    const app = page.locator('.app');
    const appHeight = await app.evaluate((el) => 
      window.getComputedStyle(el).height
    );
    expect(appHeight).not.toBe('auto');

    // Check .crt has 100% height
    const crt = page.locator('.crt');
    const crtHeight = await crt.evaluate((el) => 
      window.getComputedStyle(el).height
    );
    expect(crtHeight).not.toBe('auto');

    // Check .shell has flex: 1 and min-height: 0
    const shell = page.locator('.shell');
    const shellStyles = await shell.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        flex: styles.flex,
        minHeight: styles.minHeight,
        display: styles.display,
      };
    });
    expect(shellStyles.flex).toContain('1');
    expect(shellStyles.minHeight).toBe('0px');
    expect(shellStyles.display).toBe('flex');
  });

  test('should start a session and verify layout fills viewport', async ({ page }) => {
    // Click start session button
    const startButton = page.locator('[data-testid="start-session-button"]');
    await startButton.click();

    // Wait for session view to appear
    await page.waitForSelector('.session-view', { state: 'visible', timeout: 10000 });

    // Verify session view structure
    const sessionView = page.locator('.session-view');
    await expect(sessionView).toBeVisible();

    // Check session-view has proper flex properties
    const sessionViewStyles = await sessionView.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        flex: styles.flex,
        minHeight: styles.minHeight,
        display: styles.display,
        flexDirection: styles.flexDirection,
      };
    });
    expect(sessionViewStyles.flex).toContain('1');
    expect(sessionViewStyles.minHeight).toBe('0px');
    expect(sessionViewStyles.display).toBe('flex');
    expect(sessionViewStyles.flexDirection).toBe('column');

    // Verify main grid exists and has proper properties
    const main = page.locator('.main');
    await expect(main).toBeVisible();

    const mainStyles = await main.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        display: styles.display,
        gridTemplateColumns: styles.gridTemplateColumns,
        minHeight: styles.minHeight,
        flex: styles.flex,
      };
    });
    expect(mainStyles.display).toBe('grid');
    expect(mainStyles.minHeight).toBe('0px');
    expect(mainStyles.flex).toContain('1');

    // Verify left and right columns exist
    const leftCol = page.locator('.left-col');
    await expect(leftCol).toBeVisible();

    const rightCol = page.locator('.right-col');
    await expect(rightCol).toBeVisible();

    // Check left-col has min-height: 0 and min-width: 0
    const leftColStyles = await leftCol.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        minHeight: styles.minHeight,
        minWidth: styles.minWidth,
        display: styles.display,
      };
    });
    expect(leftColStyles.minHeight).toBe('0px');
    expect(leftColStyles.minWidth).toBe('0px');
    expect(leftColStyles.display).toBe('flex');

    // Check right-col has min-height: 0 and min-width: 0
    const rightColStyles = await rightCol.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        minHeight: styles.minHeight,
        minWidth: styles.minWidth,
        display: styles.display,
      };
    });
    expect(rightColStyles.minHeight).toBe('0px');
    expect(rightColStyles.minWidth).toBe('0px');
    expect(rightColStyles.display).toBe('flex');
  });

  test('should verify chat panel fills its container', async ({ page }) => {
    await page.locator('[data-testid="start-session-button"]').click();
    await page.waitForSelector('.chatLog', { state: 'visible', timeout: 10000 });

    // Verify chat log has proper flex properties
    const chatLog = page.locator('.chatLog');
    const chatLogStyles = await chatLog.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        flex: styles.flex,
        minHeight: styles.minHeight,
        overflowY: styles.overflowY,
        height: rect.height,
      };
    });

    expect(chatLogStyles.flex).toContain('1');
    expect(chatLogStyles.minHeight).toBe('0px');
    expect(chatLogStyles.overflowY).toBe('auto');
    // Chat log should have actual height (not collapsed)
    expect(chatLogStyles.height).toBeGreaterThan(100);
  });

  test('should verify editor fills its container', async ({ page }) => {
    // Skip settings and start session
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    const isSettingsVisible = await settingsModal.isVisible().catch(() => false);
    
    if (isSettingsVisible) {
      const closeButton = page.locator('button:has-text("Close")');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }
    }

    await page.locator('[data-testid="start-session-button"]').click();
    await page.waitForSelector('.editor', { state: 'visible', timeout: 10000 });

    // Verify editor has proper flex properties
    const editor = page.locator('.editor');
    const editorStyles = await editor.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        flex: styles.flex,
        minHeight: styles.minHeight,
        height: rect.height,
      };
    });

    expect(editorStyles.flex).toContain('1');
    expect(editorStyles.minHeight).toBe('0px');
    // Editor should have actual height (not collapsed)
    expect(editorStyles.height).toBeGreaterThan(200);
  });

  test('should not have dead space - viewport should be filled', async ({ page }) => {
    // Skip settings and start session
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    const isSettingsVisible = await settingsModal.isVisible().catch(() => false);
    
    if (isSettingsVisible) {
      const closeButton = page.locator('button:has-text("Close")');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }
    }

    await page.locator('[data-testid="start-session-button"]').click();
    await page.waitForSelector('.session-view', { state: 'visible', timeout: 10000 });

    // Get viewport height
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    // Get shell height (should be close to viewport height minus padding)
    const shellHeight = await page.locator('.shell').evaluate((el) => 
      el.getBoundingClientRect().height
    );

    // Shell should fill most of the viewport (accounting for .crt padding of 18px * 2 = 36px)
    expect(shellHeight).toBeGreaterThan(viewportHeight - 50);

    // Get main grid height
    const mainHeight = await page.locator('.main').evaluate((el) => 
      el.getBoundingClientRect().height
    );

    // Main should have substantial height (not collapsed)
    expect(mainHeight).toBeGreaterThan(400);

    // Get right column height
    const rightColHeight = await page.locator('.right-col').evaluate((el) => 
      el.getBoundingClientRect().height
    );

    // Right column should match main height (no collapse)
    expect(rightColHeight).toBe(mainHeight);
  });
});
