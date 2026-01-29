
import fs from 'fs';
import path from 'path';
import { GerberToPath } from './src/features/parser/utils/vectorUtils';

// Mock Gerber with simulated hatching and G36 region
const TEST_GERBER = `
G04 Test File with Hatching simulation*
%FSLAX24Y24*%
%MOMM*%
%ADD10C,1.000*%  (D10 is 1.0mm)
%ADD11C,0.200*%  (D11 is 0.2mm)
G01*
D10*
X0Y0D02*
X1000Y0D01*      (10mm line)
X1000Y1000D01*
X0Y1000D01*
X0Y0D01*

D10* (Use Wide tool 1mm)
X2000Y0D02* (Move to 20mm)
X3000Y0D01* (Draw Box 10mm wide)
X3000Y1000D01*
X2000Y1000D01*
X2000Y0D01*

(Hatching Simulation - 0.5mm step)
X2000Y100D02*
X3000Y100D01*
X2000Y200D02*
X3000Y200D01*
X2000Y300D02*
X3000Y300D01*
(If stroke is 0.1mm, these will be separated lines. If stroke 1.0mm, solid)

(G36 Region)
G36*
X5000Y5000D02*
X6000Y5000D01*
X6000Y6000D01*
X5000Y6000D01*
G37*
`;

function generateHtml(pathData: string, bounds: any) {
    // We render TWO paths.
    // 1. Standard (Thin)
    // 2. Thick (Simulated Aperture 1.0mm)

    // Bounds width in mm is roughly bounds.width. (If normalized to mm).
    // Note: Our parser uses 10000 divisor for 2.4.
    // X1000 -> 0.1? No 1000/10000 = 0.1.
    // If we want 10mm, we need X100000.

    // Actually, let's just stick to unit-less relative sizes.
    // The Bounds will tell us the scale.
    // If bounds width is ~1.0, then a 1.0 stroke covers everything. Use 0.1 stroke.

    // We will assume "Units" are whatever the parser produced.

    // To visualize "Hatching Fix", we render with a FAT stroke relative to bounds.
    const thinStroke = bounds.width / 300;
    const thickStroke = bounds.width / 15; // Simulate a wide aperture relative to object

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { background: #222; color: #eee; display: flex; flex-direction: column; align-items: center; font-family: sans-serif; }
            .container { display: flex; gap: 20px; }
            .view { border: 1px solid #444; background: #000; width: 45vw; height: 45vh; }
            h3 { margin: 5px; }
        </style>
    </head>
    <body>
        <h1>Parser Debug: Hatching & Regions</h1>
        <div class="container">
            <div>
                <h3>Standard (Thin Stroke)</h3>
                <svg class="view" viewBox="${bounds.x - bounds.width * 0.1} ${bounds.y - bounds.height * 0.1} ${bounds.width * 1.2} ${bounds.height * 1.2}">
                    <path d="${pathData}" fill="${pathData.includes('Z') ? 'orange' : 'none'}" stroke="lime" stroke-width="${thinStroke}" fill-opacity="0.5" />
                </svg>
            </div>
            <div>
                <h3>Simulated Aperture (Thick Stroke)</h3>
                <svg class="view" viewBox="${bounds.x - bounds.width * 0.1} ${bounds.y - bounds.height * 0.1} ${bounds.width * 1.2} ${bounds.height * 1.2}">
                    <path d="${pathData}" fill="${pathData.includes('Z') ? 'orange' : 'none'}" stroke="lime" stroke-width="${thickStroke}" fill-opacity="0.5" stroke-linecap="round" />
                </svg>
            </div>
        </div>
        <pre>Path Data Len: ${pathData.length}</pre>
    </body>
    </html>
    `;
}

async function run() {
    const pathData = GerberToPath.convert(TEST_GERBER);
    const bounds = GerberToPath.getBounds([{ content: pathData }]);
    console.log('Bounds:', bounds);

    const html = generateHtml(pathData, bounds);
    const outFile = path.resolve(process.cwd(), 'debug-output.html');
    fs.writeFileSync(outFile, html);
    console.log('Saved to', outFile);
}

run();
