
import gerberToSvg from 'gerber-to-svg';

export interface ParsedGerber {
    svg: string; // The inner SVG content (defs + g)
    bounds: { x: number, y: number, width: number, height: number };
    units: string;
}

export const convertGerberToSvg = async (file: File | string, layerId: string): Promise<ParsedGerber> => {
    let text = '';
    if (typeof file === 'string') {
        text = file;
    } else {
        text = await file.text();
    }

    // Use gerber-to-svg library
    // The types for gerber-to-svg might need adjustment depending on the exact version and export style,
    // but based on tests 'gerberToSvg' is the default export function.

    return new Promise((resolve, reject) => {
        const options: any = {
            id: layerId,
        };

        // @ts-ignore - The library types are incorrect, it supports a callback
        const converter = gerberToSvg(text, options, (err: any, result: any) => {
            if (err) {
                console.warn("Gerber Parsing Error:", err);
                return reject(err);
            }

            // --- 1. Robust Unit Detection ---
            // Sometimes parser fails to update 'converter.units' from the stream context
            // checking the file content manually for overrides.
            let units = converter.units;
            if (!units) {
                if (text.match(/%MOIN\*%?/)) units = 'in';
                else if (text.match(/%MOMM\*%?/)) units = 'mm';
            }
            // fallback/default
            if (!units) units = 'mm'; // Most reasonable default if unspecified

            // --- 2. Scaling Factors ---
            let widthMm = converter.width;
            let heightMm = converter.height;

            // If parser said 'in' or we detected 'in', convert
            if (units === 'in') {
                widthMm *= 25.4;
                heightMm *= 25.4;
            }

            const viewBox = converter.viewBox;
            // viewBox is [minX, minY, width, height] in INTERNAL units.

            if (!viewBox || viewBox.length < 4 || (viewBox[2] === 0 && viewBox[3] === 0)) {
                // If empty viewbox, empty layer
                return resolve({
                    svg: '',
                    bounds: { x: 0, y: 0, width: 0, height: 0 },
                    units: 'mm'
                });
            }

            const vbMinX = viewBox[0];
            const vbMinY = viewBox[1];
            const vbWidth = viewBox[2];
            const vbHeight = viewBox[3];

            // Calculate scale from internal units to MM
            let scale = 1;

            // If widthMm is valid (non-zero) and vbWidth is valid
            if (vbWidth > 0 && widthMm > 0) {
                scale = widthMm / vbWidth;
            } else {
                // Fallback if widthMm is 0 (parsing failed to calculate size?)
                // We can estimate scale if we assume standard res? 
                // But better to trust vbWidth if widthMm is 0?
                // No, if widthMm is 0, the layer is effectively empty or single point.
                scale = 1;
            }

            // Sanity Check: If "Very Small", maybe we missed units='in'?
            // If dimensions are tiny (e.g. < 1mm) but coordinates are large?
            // Hard to guess without user input. relying on MO command check above.

            // --- 3. Construct Bounds ---
            const bounds = {
                x: vbMinX * scale,
                y: vbMinY * scale,
                width: vbWidth * scale, // Recalculate from internal width * scale to be consistent
                height: vbHeight * scale
            };

            // --- 4. Color Correction (Safe Mode) ---
            // We use converter.layer (drawing) and converter.defs (macros/masks)
            // We ONLY modify .layer to use currentColor.
            // We DO NOT modify .defs to avoid breaking black/white masks.

            let layerContent = '';
            if (converter.layer && Array.isArray(converter.layer)) {
                layerContent = converter.layer.join('');
                // Replace stroke/fill colors in the drawing layer only
                // Matches stroke="..." or fill="..." but NOT none/url(...)
                // Actually relying on CSS inheritance is safer, but gerber-to-svg adds explicit colors.

                // Replace explicit black/white strokes/fills with currentColor
                // But BEWARE: White usually means "clear/subtractive" in polarity.
                // Subtractive layers usually use masks, but sometimes white draw over black?
                // Standard Gerber: Dark/Clear. 
                // gerber-to-svg handles Dark/Clear using masks mostly.

                // Safe replacement: Replace 'black' (standard draw) with 'currentColor'.
                // Leave 'white' (clear) alone?

                layerContent = layerContent.replace(/stroke="black"/gi, 'stroke="currentColor"');
                layerContent = layerContent.replace(/fill="black"/gi, 'fill="currentColor"');

                // Also hex black #000000
                layerContent = layerContent.replace(/stroke="#000000"/gi, 'stroke="currentColor"');
                layerContent = layerContent.replace(/fill="#000000"/gi, 'fill="currentColor"');
            }

            const defsContent = (converter.defs && Array.isArray(converter.defs)) ? converter.defs.join('') : '';

            // --- 5. Assemble SVG ---
            const svgContent = `
                ${defsContent}
                <g transform="scale(${scale})">
                    ${layerContent}
                </g>
            `;

            resolve({
                svg: svgContent,
                bounds: bounds,
                units: 'mm'
            });
        });
    });
};
