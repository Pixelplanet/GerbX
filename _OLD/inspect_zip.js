
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';

async function inspectZip() {
    const zipPath = path.resolve('Input files/Gerber.zip');
    if (!fs.existsSync(zipPath)) {
        console.error('File not found:', zipPath);
        return;
    }
    const buffer = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(buffer);
    console.log('Files in zip:');
    for (const [filename, file] of Object.entries(zip.files)) {
        if (!file.dir) {
            const content = await file.async('uint8array');
            console.log(`${filename}: ${content.length} bytes`);
        } else {
            console.log(`${filename}: (directory)`);
        }
    }
}

inspectZip();
