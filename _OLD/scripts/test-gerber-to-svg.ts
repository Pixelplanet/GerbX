import fs from 'fs';
import path from 'path';
import gerberToSvg from 'gerber-to-svg';

const testFile = path.join(process.cwd(), 'Input files', 'Gerber', 'RoyalBlue54L-Feather-F_Cu.gbr');
const gerberContent = fs.readFileSync(testFile, 'utf-8');

console.log('Testing gerber-to-svg library...\n');

const converter = gerberToSvg(gerberContent, { id: 'test-layer' });

let fullSvg = '';

converter.on('data', (chunk: string | Buffer) => {
    fullSvg += chunk.toString();
});

converter.on('end', () => {
    console.log('Conversion complete!');
    console.log('SVG length:', fullSvg.length);
    console.log('\nFirst 1000 characters:');
    console.log(fullSvg.substring(0, 1000));
    console.log('\n...\n');
    console.log('Last 500 characters:');
    console.log(fullSvg.substring(fullSvg.length - 500));

    console.log('\n--- Converter Properties ---');
    console.log('Units:', converter.units);
    console.log('ViewBox:', converter.viewBox);
    console.log('Width:', converter.width);
    console.log('Height:', converter.height);

    // Save to file for inspection
    const outPath = path.join(process.cwd(), 'test-gerber-to-svg-output.svg');
    fs.writeFileSync(outPath, fullSvg);
    console.log(`\nSaved to: ${outPath}`);
});

converter.on('error', (err: any) => {
    console.error('ERROR:', err);
});
