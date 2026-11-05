import { changeDpiBlob } from 'changedpi';
import { combinedBounds } from './svgExport.js';

const MAX_CANVAS_DIM = 16384;
const MAX_CANVAS_PIXELS = 8192 * 8192;

function createCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function ringsToPath2D(rings) {
    const path = new Path2D();
    for (const ring of rings) {
        if (ring.length < 3) continue;
        path.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
        path.closePath();
    }
    return path;
}

/**
 * Rasterize geometry layers (mm, Y up) onto a canvas at a physical DPI.
 * The pixel size is derived from the true geometry bounds, so the PNG is
 * dimensionally exact; oversized requests are clamped and the effective DPI reported.
 *
 * layers: [{ id, color, fills: rings[], opacity? }]
 * options: { dpi, padding (mm), mirror, background (css color|null), bounds, minFeaturePx }
 */
export function renderLayersToCanvas(layers, options = {}) {
    const { dpi = 1000, padding = 0, mirror = false, background = '#ffffff', minFeaturePx = 1 } = options;
    const bounds = options.bounds || combinedBounds(layers);
    if (!bounds) return null;

    const [minX, minY, maxX, maxY] = bounds;
    const widthMm = maxX - minX + 2 * padding;
    const heightMm = maxY - minY + 2 * padding;

    let pxPerMm = dpi / 25.4;
    let width = Math.ceil(widthMm * pxPerMm);
    let height = Math.ceil(heightMm * pxPerMm);
    const limit = Math.min(1, MAX_CANVAS_DIM / width, MAX_CANVAS_DIM / height, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    if (limit < 1) {
        pxPerMm *= limit;
        width = Math.floor(widthMm * pxPerMm);
        height = Math.floor(heightMm * pxPerMm);
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`Could not allocate a ${width}x${height} canvas`);

    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
    }

    // mm (Y up) -> device pixels (Y down), optionally mirrored for the back side
    ctx.setTransform(
        mirror ? -pxPerMm : pxPerMm, 0,
        0, -pxPerMm,
        (mirror ? maxX + padding : padding - minX) * pxPerMm,
        (maxY + padding) * pxPerMm,
    );
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const layer of layers) {
        if (!layer.fills || !layer.fills.length) continue;
        const path = ringsToPath2D(layer.fills);
        ctx.globalAlpha = layer.opacity ?? 1;
        ctx.fillStyle = layer.color;
        ctx.fill(path, 'evenodd');
        if (minFeaturePx > 0) {
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = minFeaturePx / pxPerMm;
            ctx.stroke(path);
        }
    }
    ctx.globalAlpha = 1;

    return { canvas, width, height, widthMm, heightMm, dpi: pxPerMm * 25.4, bounds };
}

export function canvasToPngBlob(canvas) {
    if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
    });
}

/** Render layers to a PNG blob with the DPI stored in the file's pHYs chunk. */
export async function renderPng(layers, options = {}) {
    const result = renderLayersToCanvas(layers, options);
    if (!result) return null;
    let blob = await canvasToPngBlob(result.canvas);
    blob = new Blob([await changeDpiBlob(blob, Math.round(result.dpi))], { type: 'image/png' });
    result.canvas.width = 0;
    result.canvas.height = 0;
    const { canvas, ...meta } = result;
    void canvas;
    return { blob, ...meta };
}
