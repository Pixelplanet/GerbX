import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Upload Gerber file
    const fileInput = page.locator('input[type="file"]').first();
    const gerberPath = path.join(process.cwd(), 'Input files', 'Gerber.zip');

    if (fs.existsSync(gerberPath)) {
        await fileInput.setInputFiles(gerberPath);
        await page.waitForTimeout(3000);

        // Inspect the DOM structure
        const domAnalysis = await page.evaluate(() => {
            const main = document.querySelector('main');
            if (!main) return { error: 'No main element' };

            const svg = main.querySelector('svg');
            if (!svg) return { error: 'No SVG in main' };

            const paths = Array.from(svg.querySelectorAll('path'));
            const groups = Array.from(svg.querySelectorAll('g'));
            const fragments = Array.from(document.querySelectorAll('.gerber-fragment-container'));

            // Get info about first few paths
            const pathInfo = paths.slice(0, 5).map(p => ({
                d: p.getAttribute('d')?.substring(0, 100),
                fill: p.getAttribute('fill'),
                stroke: p.getAttribute('stroke'),
                computedFill: window.getComputedStyle(p).fill,
                computedStroke: window.getComputedStyle(p).stroke,
                visibility: window.getComputedStyle(p).visibility,
                display: window.getComputedStyle(p).display
            }));

            // Get fragment container HTML
            const fragmentHTML = fragments.map(f => ({
                innerHTML: f.innerHTML.substring(0, 200),
                classes: f.className
            }));

            return {
                svg: {
                    viewBox: svg.getAttribute('viewBox'),
                    width: svg.getAttribute('width'),
                    height: svg.getAttribute('height'),
                    transform: svg.getAttribute('transform')
                },
                counts: {
                    paths: paths.length,
                    groups: groups.length,
                    fragments: fragments.length
                },
                pathSamples: pathInfo,
                fragmentSamples: fragmentHTML,
                mainHTML: main.innerHTML.substring(0, 500)
            };
        });

        console.log('=== DOM ANALYSIS ===');
        console.log(JSON.stringify(domAnalysis, null, 2));

        // Save screenshot
        await page.screenshot({ path: 'debug-rendering.png', fullPage: true });
        console.log('\nScreenshot saved to debug-rendering.png');

        // Save SVG source
        const svgContent = await page.evaluate(() => {
            const main = document.querySelector('main');
            const svg = main?.querySelector('svg');
            return svg?.outerHTML;
        });

        if (svgContent) {
            fs.writeFileSync('debug-svg-output.svg', svgContent);
            console.log('SVG source saved to debug-svg-output.svg');
        }

    } else {
        console.log('Gerber file not found at:', gerberPath);
    }

    await browser.close();
})();
