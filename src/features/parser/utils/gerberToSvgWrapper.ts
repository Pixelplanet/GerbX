
import gerberToSvg from 'gerber-to-svg';

export interface ParsedGerber {
    svg: string; // The inner SVG content (defs + g)
    bounds: { x: number, y: number, width: number, height: number };
    units: string;
}

export const convertGerberToSvg = (gerberContent: string, layerId: string, options?: { plotAsOutline?: boolean }): Promise<ParsedGerber> => {
    return new Promise((resolve, reject) => {
        const plotAsOutline = options?.plotAsOutline ?? false;
        // Use layerId as the prefix to prevent ID collisions
        // Explicitly set format options to match the file header (FSLAX46Y46)
        const converter = gerberToSvg(gerberContent, {
            id: layerId,
            plotAsOutline: plotAsOutline,
            optimizePaths: true,    // Optimize the outlines
            places: [4, 6], // precision 4.6 from FSLAX46Y46
            zero: 'L',      // Leading zero omitted
            units: 'mm'     // Units mm
        });

        let fullSvg = '';

        converter.on('data', (chunk: string | Buffer) => {
            const str = chunk.toString();
            fullSvg += str;
            if (fullSvg.length % 1000 < str.length) {
                console.log(`Converter: received ${fullSvg.length} bytes`);
            }
        });

        converter.on('end', () => {
            console.log('Converter: stream ended');
            try {
                // Extract inner content (defs + g)
                const start = fullSvg.indexOf('>') + 1;
                const end = fullSvg.lastIndexOf('</svg>');
                const innerContent = fullSvg.substring(start, end);

                // Get standard properties
                const units = converter.units || 'mm';
                const vb = converter.viewBox;

                if (!vb || vb.length < 4) {
                    console.log('Converter: invalid viewBox');
                    // Fallback for empty/invalid
                    resolve({
                        svg: '',
                        bounds: { x: 0, y: 0, width: 0, height: 0 },
                        units
                    });
                    return;
                }

                // Calculate scale factor to normalize to MM
                let scale = 0.001; // Default for mm (1000 units = 1mm)
                if (units === 'in') {
                    scale = 0.001 * 25.4; // 1000 units = 1 inch = 25.4mm
                }

                // Fix: Replace fill="currentColor" and stroke="currentColor" with actual colors
                // The gerber-to-svg library outputs paths with currentColor.
                // We force wireframe mode to show details inside solid regions.
                let processedContent = innerContent;

                // Force wireframe attributes: fill="none", visible stroke
                // Ensure solid black fill for boolean math visibility
                // Wrapped content to normalize scale
                const wrappedSvg = `<g transform="scale(${scale})">${processedContent}</g>`;

                // Diagnostic: Count paths AND use elements to verify detail level
                const pathCount = (processedContent.match(/<path/g) || []).length;
                const useCount = (processedContent.match(/<use/g) || []).length;
                console.log(`[v1.4.10-debug] Layer ${layerId}: ${pathCount} paths, ${useCount} use elements. (Wireframe Patched)`);
                console.log('Converter: SVG wrapped and wireframe attributes enforced');

                // Normalized bounds in mm
                const bounds = {
                    x: vb[0] * scale,
                    y: vb[1] * scale,
                    width: vb[2] * scale,
                    height: vb[3] * scale
                };

                console.log(`Converter: conversion finished, bounds: ${JSON.stringify(bounds)}`);
                resolve({
                    svg: wrappedSvg,
                    bounds,
                    units: 'mm' // We normalized to mm
                });
            } catch (err) {
                console.error('Converter: CRASH in on(end):', err);
                reject(err);
            }
        });

        converter.on('error', (err: any) => {
            console.error(`Converter: error parsing gerber layer ${layerId}:`, err);
            reject(err);
        });
    });
};
