import { ringsBounds } from './geometry.js';

function fmt(v, decimals) {
    return Number(v.toFixed(decimals)).toString();
}

export function ringsToPathData(rings, mapPoint, decimals = 4) {
    let d = '';
    for (const ring of rings) {
        if (ring.length < 3) continue;
        for (let i = 0; i < ring.length; i++) {
            const [x, y] = mapPoint(ring[i]);
            d += (i === 0 ? 'M' : 'L') + fmt(x, decimals) + ' ' + fmt(y, decimals);
        }
        d += 'Z';
    }
    return d;
}

export function combinedBounds(layers) {
    const all = [];
    for (const layer of layers) {
        const b = ringsBounds(layer.fills || []);
        if (b) all.push([[b[0], b[1]], [b[2], b[3]]]);
    }
    return ringsBounds(all);
}

/**
 * Build a self-contained SVG document (string) in millimetres.
 * layers: [{ id, color, fills: rings[], opacity? }]
 * options: { padding (mm), mirror (view from the back), background (css color|null), decimals }
 */
export function buildSvgDocument(layers, options = {}) {
    const { padding = 0, mirror = false, background = null, decimals = 4 } = options;
    const bounds = options.bounds || combinedBounds(layers);
    if (!bounds) return { svg: null, width: 0, height: 0, bounds: null };
    const [minX, minY, maxX, maxY] = bounds;
    const width = maxX - minX + 2 * padding;
    const height = maxY - minY + 2 * padding;

    const mapPoint = ([x, y]) => [
        mirror ? maxX - x + padding : x - minX + padding,
        maxY - y + padding,
    ];

    const w = fmt(width, decimals), h = fmt(height, decimals);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n`;
    if (background) svg += `  <rect x="0" y="0" width="${w}" height="${h}" fill="${background}"/>\n`;
    for (const layer of layers) {
        if (!layer.fills || !layer.fills.length) continue;
        const d = ringsToPathData(layer.fills, mapPoint, decimals);
        if (!d) continue;
        const opacity = layer.opacity != null && layer.opacity !== 1 ? ` opacity="${layer.opacity}"` : '';
        svg += `  <g id="${layer.id}" fill="${layer.color}" fill-rule="evenodd" stroke="none"${opacity}>\n    <path d="${d}"/>\n  </g>\n`;
    }
    svg += '</svg>\n';
    return { svg, width, height, bounds };
}
