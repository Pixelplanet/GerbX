
/**
 * Utility to convert SVG content to high-quality JPG images
 */

export const rasterizeLayer = async (
    svgContent: string,
    bounds: { width: number; height: number; x: number; y: number },
    color: string = '#000000',
    dpi: number = 300
): Promise<string> => {
    return new Promise((resolve, reject) => {
        // 1. Calculate dimensions in pixels based on DPI
        // 1 inch = 25.4 mm
        const pixelsPerMm = dpi / 25.4;
        const widthPx = Math.ceil(bounds.width * pixelsPerMm);
        const heightPx = Math.ceil(bounds.height * pixelsPerMm);

        if (widthPx <= 0 || heightPx <= 0) {
            console.warn("Invalid bounds for rasterization", bounds);
            resolve("");
            return;
        }

        // Limit maximum size to prevent browser crash (e.g., 4k or 8k max)
        const maxDim = 8000;
        let scale = 1;
        if (widthPx > maxDim || heightPx > maxDim) {
            scale = maxDim / Math.max(widthPx, heightPx);
        }

        const finalWidth = Math.ceil(widthPx * scale);
        const finalHeight = Math.ceil(heightPx * scale);

        // 2. Wrap content in a full SVG with proper viewBox and size
        // The content already has a transform="scale(...)" from gerberToSvgWrapper
        // But we need to offset it by -bounds.x, -bounds.y to make it fit the canvas
        const fullSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${finalWidth}" height="${finalHeight}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
                <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="black" />
                <g color="${color}" fill="currentColor" stroke="currentColor">
                    ${svgContent}
                </g>
            </svg>
        `;

        // 3. Render to Canvas
        const canvas = document.createElement('canvas');
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }

        const img = new Image();
        const svgBlob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, finalWidth, finalHeight);
            ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

            // 4. Export to JPG
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };

        img.onerror = (err) => {
            console.error("Image loading failed", err);
            URL.revokeObjectURL(url);
            reject(err);
        };

        img.src = url;
    });
};
