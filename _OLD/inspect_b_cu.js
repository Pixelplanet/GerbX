
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';

async function inspectB_Cu() {
    const zipPath = path.resolve('Input files/Gerber.zip');
    const buffer = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.files['Gerber/RoyalBlue54L-Feather-B_Cu.gbr'];
    const content = await file.async('string');
    console.log('First 500 chars of B_Cu:');
    console.log(content.substring(0, 500));
}

inspectB_Cu();
