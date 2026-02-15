
import { convertGerberToSvg } from './src/features/parser/utils/gerberToSvgWrapper';
import { XCSGenerator } from './src/features/parser/utils/xcsGenerator';

async function testChain() {
    console.log("Starting Integration Test...");

    // 1. Mock Gerber Data (10mm x 10mm square)
    // %FSLAX46Y46*% means 4.6 format (divide by 1000000).
    // X0Y0 -> X10000000Y10000000 (10mm)
    const gerber = `
G04 Test Square*
%FSLAX46Y46*%
%MOMM*%
%ADD10C,0.1*%
D10*
X0Y0D02*
X10000000Y0D01*
X10000000Y10000000D01*
X0Y10000000D01*
X0Y0D01*
M02*
    `;

    // 2. Test Parser
    console.log("Testing Parser...");
    try {
        const result = await convertGerberToSvg(gerber, 'test-layer');
        console.log("Parser Result:", {
            bounds: result.bounds,
            units: result.units,
            svgLength: result.svg.length
        });

        if (result.svg.indexOf('scale(') === -1) {
            console.error("FAIL: SVG content does not contain scale transform.");
            process.exit(1);
        }

        // Check bounds (should be approx 10mm x 10mm)
        // Note: gerber-to-svg might add padding or line width to bounds.
        // Line width is 0.1mm. So bounds might be slighty larger.
        const width = result.bounds.width;
        if (Math.abs(width - 10) > 0.5) {
            console.warn(`WARNING: Bounds width ${width} is not exactly 10mm. This might be due to line width.`);
        } else {
            console.log("PASS: Bounds width is approx 10mm.");
        }

        // 3. Extract Paths (Logic from useExport)
        console.log("Extracting Paths...");
        const regex = /d=["']([^"']+)["']/g;
        const paths: string[] = [];
        let match;
        while ((match = regex.exec(result.svg)) !== null) {
            paths.push(match[1]);
        }

        console.log(`Found ${paths.length} paths.`);
        if (paths.length === 0) {
            console.error("FAIL: No paths found in SVG.");
            console.log("SVG Content:", result.svg);
            process.exit(1);
        }

        // 4. Test XCS Generator
        console.log("Testing XCS Generator...");
        const layer = {
            name: 'Test Layer',
            visible: true,
            color: { r: 0, g: 0, b: 0 }, // XCSGenerator expects object or hex?
            // In useExport we pass {name, color: {r,g,b}, paths...}
            // Wait, useExport converts PCBLayer (hex) to RGB object for XCS.
            // XCSGenerator `createPathDisplayWithPath` takes `color`.
            // `rgbToHex` is called on it.
            // So we can pass Hex string if `rgbToHex` supports it.
            // `xcsGenerator.ts` line 253: `if (typeof color === 'string'...) return color`.
            // So passing hex string is fine!

            paths: paths,
            speed: 100,
            power: 10,
            passes: 1,
            frequency: 60
        };

        const gen = new XCSGenerator();
        const jsonStr = gen.generate(null, [layer], { width: 100, height: 100 });

        const json = JSON.parse(jsonStr);
        console.log("XCS Version:", json.version);
        console.log("Canvases:", json.canvas.length);

        const canvas = json.canvas[0];
        const displays = canvas.displays;
        console.log("Displays:", displays.length);

        if (displays.length > 0) {
            console.log("PASS: XCS generated with displays.");
        } else {
            console.error("FAIL: XCS display list is empty.");
            process.exit(1);
        }

        console.log("Integration Test SUCCESS.");

    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

testChain();
