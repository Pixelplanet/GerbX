
import fs from 'fs';
import path from 'path';
import { GerberToPath } from '../src/features/parser/utils/vectorUtils';

// Mock PCB Layout with various features
const TEST_GERBER = `
G04 Test File for GerbX Parser*
%FSLAX24Y24*%
%MOMM*%
%ADD10C,1.5*%    (D10 used for Pads - 1.5mm)
%ADD11C,0.2*%    (D11 used for Tracks - 0.2mm)
G01*
D10*
X0Y0D02*         (Move to 0,0)
X1000Y0D01*      (Draw Line to 100,0 - normalized divisor 10000 -> 10mm)
X1000Y1000D01*   (Draw Line to 100,100)
X0Y1000D01*      (Draw Line to 0,100)
X0Y0D01*         (Draw Line to 0,0 - Box Complete)
D11*
X500Y500D02*     (Move Center)
G36*             (Start Region)
X600Y600D02*     (Region Start)
X700Y600D01*
X700Y700D01*
X600Y700D01*
X600Y600D01*
G37*             (End Region - Should Close)
M02*
`;

// Helper to generate HTML
function generateHtml(pathData: string, bounds: any) {
    const strokeWidth = bounds.width / 100;
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { background: #111; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        svg { border: 1px solid #333; max-width: 90vw; max-height: 80vh; background: #000; }
        .info { margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="info">
        <h3>Gerber Parser Debug View</h3>
        <p>Bounds: X=${bounds.x} Y=${bounds.y} W=${bounds.width} H=${bounds.height}</p>
    </div>
    <svg viewBox="${bounds.x - 10} ${bounds.y - 10} ${bounds.width + 20} ${bounds.height + 20}" xmlns="http://www.w3.org/2000/svg">
        <path d="${pathData}" 
              fill="${pathData.includes('Z') ? '#e67e22' : 'none'}" 
              stroke="#2ecc71" 
              stroke-width="${strokeWidth}" 
              fill-opacity="0.5" 
              stroke-linecap="round" 
              stroke-linejoin="round"/>
    </svg>
</body>
</html>
    `;
}

async function run() {
    console.log('--- Starting Gerber Parser Test ---');

    // 1. Process
    const pathData = GerberToPath.convert(TEST_GERBER);
    console.log(`Path Length: ${pathData.length} chars`);

    // 2. Bounds
    const bounds = GerberToPath.getBounds([{ content: pathData }]);
    console.log('Computed Bounds:', bounds);

    // 3. Output HTML
    const html = generateHtml(pathData, bounds);
    const outPath = path.resolve(process.cwd(), 'debug-output.html');
    fs.writeFileSync(outPath, html);

    console.log(`Debug HTML written to: ${outPath}`);
    console.log('--- Test Complete ---');
}

run().catch(console.error);
