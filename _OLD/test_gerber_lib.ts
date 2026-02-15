
import gerberToSvg from 'gerber-to-svg';

async function test() {
    const gerber = `
G04 Test Gerber*
%FSLAX46Y46*%
%MOMM*%
%ADD10C,1.0*%
D10*
X0Y0D02*
X1000000Y1000000D01*
M02*
    `;

    console.log("Running converter...");

    // Using promise wrapper for cleaner async/await
    const svg = await new Promise((resolve, reject) => {
        gerberToSvg(gerber, { attributes: { width: '100mm', height: '100mm' } }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    console.log("Conversion complete.");
    console.log("SVG Output:", svg);
}

test().catch(console.error);
