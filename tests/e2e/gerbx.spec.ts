import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('GerbX Application', () => {

    test.beforeEach(async ({ page }) => {


        await page.goto('/');

        // Disable animations for stable snapshots
        await page.addStyleTag({
            content: `
                *, *::before, *::after {
                    animation-duration: 0s !important;
                    transition-duration: 0s !important;
                }
            `
        });
    });

    test('should have correct title and initial UI state', async ({ page }) => {
        await expect(page).toHaveTitle(/GerbX/);
        await expect(page.getByText('Laser Pipeline Ready')).toBeVisible();
    });

    test('should upload a Gerber ZIP file and display layers', async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join('Input files', 'Gerber.zip');

        await fileInput.setInputFiles(filePath);

        // Wait for View Mode buttons to appear as confirmation of load
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Check sidebar
        await expect(page.getByText('FRONT LAYERS')).toBeVisible();
        await expect(page.locator('.sidebar-item').first()).toBeVisible();
    });

    test('should match visual snapshot of PCB preview', async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);

        // Wait for processing to finish and UI to settle
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Wait a bit for any canvas/svg rendering that might be async (though SVG is usually immediate in React)
        // Since we disabled animations, it should be ready.
        // We target the main SVG container. 
        // Logic: The preview is within the <main> tag.

        const previewArea = page.locator('main').first();
        await expect(previewArea).toBeVisible();

        // Take snapshot.
        // First run will create the baseline. Subsequent runs will compare.
        await expect(previewArea).toHaveScreenshot('pcb-preview.png', {
            maxDiffPixelRatio: 0.05, // Allow slight rendering differences across envs
        });
    });

    test('should export valid XCS file', async ({ page }) => {
        // 1. Upload
        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // 2. Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // 3. Click Export
        await page.getByRole('button', { name: 'EXPORT .XCS' }).click();

        // 4. Wait for download
        const download = await downloadPromise;

        // 5. Verify filename
        expect(download.suggestedFilename()).toMatch(/GerbX_v.*\.xcs/);

        // 6. Verify content
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const fileContent = Buffer.concat(chunks).toString('utf-8');
        const json = JSON.parse(fileContent);

        // Check XCS structure
        expect(json).toHaveProperty('canvas');
        expect(Array.isArray(json.canvas)).toBe(true);
        expect(json.canvas[0]).toHaveProperty('displays');
        expect(Array.isArray(json.canvas[0].displays)).toBe(true);
        expect(json.canvas[0].displays.length).toBeGreaterThan(0);

        // Verify at least one item has path data
        const vectorItem = json.canvas[0].displays[0];
        expect(vectorItem).toBeTruthy();
        expect(vectorItem).toHaveProperty('dPath');
    });

    test('should allow toggling Invert Paths', async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Click first layer
        await page.locator('.sidebar-item').first().click();

        // Check Invert button
        const invertBtn = page.getByRole('button').filter({ hasText: 'Invert Paths' });
        await expect(invertBtn).toBeVisible();

        // Click to toggle
        const paddingText = page.getByText('Invert Padding (mm)');
        const initialVisible = await paddingText.isVisible();

        await invertBtn.click();

        if (initialVisible) {
            await expect(paddingText).not.toBeVisible();
        } else {
            await expect(paddingText).toBeVisible();
        }
    });

    test('should reflect Invert Paths in Visual Screenshot', async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Invert the first layer
        await page.locator('.sidebar-item').first().click();
        const invertBtn = page.getByRole('button').filter({ hasText: 'Invert Paths' });

        // Ensure it is NOT inverted to start (usually default)
        // Note: Logic allows toggle. We just want to ensure we snapshot a changed state.

        // Force Invert ON
        // If padding is NOT visible, click to SHOW it (Invert ON)
        if (!await page.getByText('Invert Padding (mm)').isVisible()) {
            await invertBtn.click();
        }

        // Snapshot
        const previewArea = page.locator('main').first();
        await expect(previewArea).toHaveScreenshot('pcb-preview-inverted.png', { maxDiffPixelRatio: 0.05 });
    });

    test('should render detailed traces, not solid blocks (CSS fix verification)', async ({ page }) => {
        const fileInput = page.locator('input[type=\"file\"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Check SVG rendering in the main preview area (not icon SVGs)
        const mainElement = page.locator('main').first();
        const svgElement = mainElement.locator('svg').first();
        await expect(svgElement).toBeVisible({ timeout: 10000 });

        // Count path elements within the main preview SVG (detailed geometry should have many paths)
        const pathCount = await mainElement.locator('svg path').count();
        console.log(`✓ Found ${pathCount} path elements in main preview SVG`);

        // We should have detailed geometry, not just 1-2 solid blocks
        expect(pathCount).toBeGreaterThan(10);

        // Check that the bad CSS rule is NOT present
        const hasCurrentColorOverride = await page.evaluate(() => {
            const rules = Array.from(document.styleSheets).flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules || []);
                } catch (e) {
                    return [];
                }
            });

            return rules.some((rule: any) => {
                return rule.selectorText?.includes('gerber-fragment-container') &&
                    rule.cssText?.includes('fill') &&
                    rule.cssText?.includes('currentColor');
            });
        });

        expect(hasCurrentColorOverride).toBe(false);
        console.log('✓ CSS does not override SVG fill/stroke with currentColor');

        // Success! The path count check above already verified we have detailed geometry
    });

    test('should render F_Cu layer with detailed copper traces', async ({ page }) => {
        const fileInput = page.locator('input[type=\"file\"]');
        const filePath = path.join('Input files', 'Gerber.zip');
        await fileInput.setInputFiles(filePath);
        await expect(page.getByRole('main').first().getByRole('button', { name: 'FRONT', exact: true }).first()).toBeVisible({ timeout: 60000 });

        // Take screenshot specifically for F_Cu layer analysis
        const previewArea = page.locator('svg').first();
        await expect(previewArea).toBeVisible();

        // Save screenshot for manual inspection
        await page.screenshot({
            path: `test-results/f-cu-layer-${Date.now()}.png`,
            fullPage: true
        });

        // Check that gerber-fragment-container contains actual SVG markup
        const fragmentContainers = page.locator('.gerber-fragment-container');
        const fragmentCount = await fragmentContainers.count();

        if (fragmentCount > 0) {
            const firstFragmentContent = await fragmentContainers.first().innerHTML();
            expect(firstFragmentContent).toContain('<');
            expect(firstFragmentContent.length).toBeGreaterThan(100);
            console.log(`✓ Fragment container has ${firstFragmentContent.length} chars of SVG content`);
        }
    });

});
