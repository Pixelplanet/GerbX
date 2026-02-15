import fs from 'fs';
import path from 'path';
import { GerberToPath } from '../src/features/parser/utils/vectorUtils';

const testFile = path.join(process.cwd(), 'Input files', 'Gerber', 'RoyalBlue54L-Feather-B_Cu.gbr');
const gerberContent = fs.readFileSync(testFile, 'utf-8');

console.log('Testing Gerber Parser on sample file...\n');

// Extract FS line
const fsMatch = gerberContent.match(/%FS[^\*]+\*%/);
console.log('Format Specification:', fsMatch ? fsMatch[0] : 'NOT FOUND');

// Extract first few coordinates
const coordMatches = gerberContent.match(/[XY]-?\d+/g);
if (coordMatches) {
    console.log('\nFirst 10 raw coordinates found:');
    coordMatches.slice(0, 10).forEach(c => console.log('  ', c));
}

// Parse with our custom parser
console.log('\n--- Custom Parser Result ---');
const result = GerberToPath.convert(gerberContent);
console.log('Bounds:', JSON.stringify(result.bounds, null, 2));
console.log('Path length:', result.path.length);
console.log('First 200 chars of path:', result.path.substring(0, 200));

// Compare with reference SVG
const svgPath = path.join(process.cwd(), 'Input files', 'SVG', 'RoyalBlue54L-Feather-B_Cu.svg');
const svgContent = fs.readFileSync(svgPath, 'utf-8');
const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
if (viewBoxMatch) {
    const [x, y, w, h] = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    console.log('\n--- Reference SVG ViewBox ---');
    console.log(JSON.stringify({ x, y, width: w, height: h }, null, 2));
}
