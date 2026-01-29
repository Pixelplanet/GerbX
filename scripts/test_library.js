
import gerberToSvg from 'gerber-to-svg';

const TEST_GERBER = `
G04 Test*
%FSLAX24Y24*%
%MOMM*%
%ADD10C,1.0*%
D10*
X0Y0D02*
X100Y0D01*
M02*
`;

console.log('Got module:', typeof gerberToSvg);

try {
    const converter = gerberToSvg(TEST_GERBER);

    // Check if it's a stream
    if (converter.on) {
        console.log('It is a stream!');
        let svg = '';
        converter.on('data', chunk => {
            svg += chunk;
        });
        converter.on('end', () => {
            console.log('Stream finished. Length:', svg.length);
            console.log('Start of SVG:', svg.substring(0, 100));
        });
        converter.on('error', err => {
            console.error('Stream Error:', err);
        });
    } else {
        console.log('Not a stream. Return value:', converter);
    }
} catch (e) {
    console.error('Crash:', e);
}
