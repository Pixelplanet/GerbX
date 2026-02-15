import { PCBLayer } from '~types/pcb';
import { rasterizeLayer } from './rasterize';

export const parseIPC2581 = async (file: File): Promise<PCBLayer[]> => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    const layers: PCBLayer[] = [];

    // 1. Get Dictionary entries (Apertures/Shapes)
    const standardDict: Record<string, string> = {};
    const standardElements = xmlDoc.getElementsByTagName('EntryStandard');
    for (let i = 0; i < standardElements.length; i++) {
        const id = standardElements[i].getAttribute('id');
        if (!id) continue;

        // Very basic conversion of common shapes to SVG path strings
        const circle = standardElements[i].getElementsByTagName('Circle')[0];
        if (circle) {
            const d = parseFloat(circle.getAttribute('diameter') || '0');
            const r = d / 2;
            standardDict[id] = `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`;
        }

        const rect = standardElements[i].getElementsByTagName('RectCenter')[0];
        if (rect) {
            const w = parseFloat(rect.getAttribute('width') || '0');
            const h = parseFloat(rect.getAttribute('height') || '0');
            standardDict[id] = `M ${-w / 2} ${-h / 2} h ${w} v ${h} h ${-w} Z`;
        }
    }

    // 2. Parse Layers and Features
    const stepElements = xmlDoc.getElementsByTagName('Step');
    for (let s = 0; s < stepElements.length; s++) {
        const layerElements = stepElements[s].getElementsByTagName('Layer');
        for (let l = 0; l < layerElements.length; l++) {
            const layerName = layerElements[l].getAttribute('name') || `Layer_${l}`;
            const features = layerElements[l].getElementsByTagName('Features')[0];
            if (!features) continue;

            let pathData = '';
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            const pads = features.getElementsByTagName('Pad');
            for (let p = 0; p < pads.length; p++) {
                const x = parseFloat(pads[p].getAttribute('x') || '0');
                const y = parseFloat(pads[p].getAttribute('y') || '0');
                const shapeId = pads[p].getAttribute('standard');

                if (shapeId && standardDict[shapeId]) {
                    // Offset the shape path
                    const shapePath = standardDict[shapeId].replace(/([-+]?\d*\.?\d+)/g, (match, val) => {
                        // This is a crude way to offset every number in the path. 
                        // In a real parser we'd parse the path properly.
                        return match; // Placeholder for now
                    });
                    // Proper way: wrap in <g transform="...">
                    pathData += `<g transform="translate(${x}, ${y})"><path d="${standardDict[shapeId]}" /></g> `;

                    // Simple bounds tracking
                    minX = Math.min(minX, x - 1);
                    minY = Math.min(minY, y - 1);
                    maxX = Math.max(maxX, x + 1);
                    maxY = Math.max(maxY, y + 1);
                }
            }

            if (pathData) {
                const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                const color = detectColorFromName(layerName);

                // 3. Generate Raster Preview
                let raster = undefined;
                try {
                    raster = await rasterizeLayer(pathData, bounds, color);
                } catch (err) {
                    console.warn(`Rasterization failed for IPC layer ${layerName}`, err);
                }

                layers.push({
                    id: crypto.randomUUID(),
                    name: layerName,
                    type: detectTypeFromName(layerName),
                    side: detectSideFromName(layerName),
                    content: pathData,
                    visible: true,
                    color: color,
                    mirrored: false,
                    inverted: layerName.includes('Cu'),
                    speed: 100,
                    power: 20,
                    frequency: 40,
                    invertPadding: 2,
                    bounds: bounds,
                    raster: raster,
                    sourceFormat: 'svg'
                });
            }
        }
    }

    return layers;
};

const detectTypeFromName = (name: string): string => {
    if (name.includes('Cu')) return 'Copper';
    if (name.includes('Silk')) return 'Silkscreen';
    if (name.includes('Mask')) return 'Solder Mask';
    return 'Other';
};

const detectColorFromName = (name: string): string => {
    const type = detectTypeFromName(name);
    if (type === 'Copper') return '#b87333';
    if (type === 'Silkscreen') return '#ffffff';
    if (type === 'Solder Mask') return '#006400';
    return '#cccccc';
};

const detectSideFromName = (name: string): 'front' | 'back' | 'internal' | 'board' => {
    const lower = name.toLowerCase();
    if (lower.startsWith('f.') || lower.includes('top')) return 'front';
    if (lower.startsWith('b.') || lower.includes('bottom')) return 'back';
    if (lower.includes('edge') || lower.includes('cut') || lower.includes('gm')) return 'board';
    return 'internal';
};
