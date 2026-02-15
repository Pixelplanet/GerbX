import { test, expect } from '@playwright/test';

test('Test Invert Paths functionality', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);

    // Upload Gerber file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('Input files/Gerber/Gerber.zip');

    // Wait for processing
    await page.waitForTimeout(8000);

    // Take screenshot before invert
    await page.screenshot({ path: 'test-before-invert.png', fullPage: true });

    // Click Invert Paths button
    const invertButton = page.getByText('Invert Paths', { exact: false });
    await invertButton.click();

    // Wait for inversion to complete
    await page.waitForTimeout(3000);

    // Take screenshot after invert
    await page.screenshot({ path: 'test-after-invert.png', fullPage: true });

    // Check for error messages in console
    const errors: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    // Check if there are any visible error indicators
    const errorElements = await page.locator('[role="alert"], .error, .text-red-500').count();

    console.log('Error count:', errorElements);
    console.log('Console errors:', errors);

    // The test passes if no errors are displayed
    expect(errorElements).toBe(0);
});
