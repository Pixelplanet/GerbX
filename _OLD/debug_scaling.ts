
import { convertGerberToSvg } from './src/features/parser/utils/gerberToSvgWrapper';

const INCH_GERBER = `G04 This is a test file in Inches*
%MOMM*%
%FSLAX24Y24*%
%LNTesting*%
%ADD10C,0.010*%
G54D10*
G01X1000Y1000D02*
X2000Y1000D01*
X2000Y2000D01*
X1000Y2000D01*
X1000Y1000D01*
M02*`;

// 1000 to 2000 in 2.4 format (XX.XXXX) -> 0.1 inch to 0.2 inch.
// Width should be 0.1 inch = 2.54 mm.

const MM_GERBER = `G04 This is a test file in MM*
%MOMM*%
%FSLAX44Y44*%
%ADD10C,1.000*%
G54D10*
G01X0Y0D02*
X100000Y0D01*
X100000Y100000D01*
X0Y100000D01*
X0Y0D01*
M02*`;
// 0 to 100000 in 4.4 format (XXXX.XXXX) -> 0 to 10 mm.
// Width should be 10 mm.

async function test() {
    console.log("--- Testing Imperial (Inches) Gerber ---");
    // Mock the Imperial Gerber header correctly for gerber-to-svg detection
    // Note: gerber-to-svg detects units from %MOIN*% or %MOMM*%.

    const gerberInches = `
%MOIN*%
%FSLAX24Y24*%
%ADD10C,0.1*%
D10*
X0Y0D02*
X10000Y0D01*
X10000Y10000D01*
X0Y10000D01*
X0Y0D01*
M02*
    `.trim();
    // 0 to 10000 with 2.4 format -> 0 to 1.0 inch.
    // Dimensions should be 1 inch = 25.4 mm.

    try {
        const result = await convertGerberToSvg(gerberInches, 'test_inch');
        console.log("Result Units:", result.units);
        console.log("Result Bounds:", result.bounds);

        const expectedWidth = 25.4;
        const widthConfig = result.bounds.width;

        if (Math.abs(widthConfig - expectedWidth) < 1.0) {
            console.log("PASS: Inch scaling looks correct.");
        } else {
            console.error(`FAIL: Expected width ~${expectedWidth}mm, got ${widthConfig}mm`);
        }

    } catch (e) {
        console.error("Error parsing inch gerber:", e);
    }

    console.log("\n--- Testing Metric (MM) Gerber ---");
    const gerberMm = `
%MOMM*%
%FSLAX44Y44*%
%ADD10C,1.0*%
D10*
X0Y0D02*
X100000Y0D01*
X100000Y100000D01*
X0Y100000D01*
X0Y0D01*
M02*
    `.trim();
    // 100000 in 4.4 -> 10mm.

    try {
        const result = await convertGerberToSvg(gerberMm, 'test_mm');
        console.log("Result Units:", result.units);
        console.log("Result Bounds:", result.bounds);

        const expectedWidth = 10.0;
        const widthConfig = result.bounds.width;

        if (Math.abs(widthConfig - expectedWidth) < 1.0) {
            console.log("PASS: MM scaling looks correct.");
        } else {
            console.error(`FAIL: Expected width ~${expectedWidth}mm, got ${widthConfig}mm`);
        }

    } catch (e) {
        console.error("Error parsing mm gerber:", e);
    }
}

test();
