import { parseLayerGeometry, ringsBounds } from './geometry.js';
import { combinedBounds } from './svgExport.js';

const LAYER_COLORS = {
    copper: '#c87533',
    soldermask: '#2a7a2a',
    solderpaste: '#9a9a9a',
    silkscreen: '#f0f0f0',
    outline: '#000000',
    drill: '#000000',
    drawing: '#808080',
};

const LAYER_ORDER = ['copper', 'soldermask', 'solderpaste', 'silkscreen', 'drawing', 'drill', 'outline'];

const geometryCache = new Map();

/** Parse (and cache) the resolved geometry for one raw layer {filename, gerber}. */
export function getLayerGeometry(layer) {
    const key = `${layer.filename}:${layer.gerber.length}`;
    const cached = geometryCache.get(key);
    if (cached && cached.gerber === layer.gerber) return cached.geometry;
    const geometry = parseLayerGeometry(layer.gerber);
    geometryCache.set(key, { gerber: layer.gerber, geometry });
    return geometry;
}

/**
 * Build export layers (geometry + colour) for one side of the board.
 * layers: context layers [{filename, gerber, type, side, enabled}]
 * side: 'top' | 'bottom'; types: optional Set of layer types to include.
 */
export function buildExportLayers(layers, { side = 'top', types = null } = {}) {
    const selected = layers.filter(l =>
        l.enabled !== false &&
        (l.side === side || l.side === 'all') &&
        (!types || types.has(l.type))
    );
    selected.sort((a, b) => LAYER_ORDER.indexOf(a.type) - LAYER_ORDER.indexOf(b.type));

    return selected.map(layer => {
        const geometry = getLayerGeometry(layer);
        return {
            id: `${layer.side}_${layer.type}`,
            name: `${layer.side}_${layer.type}`,
            type: layer.type,
            side: layer.side,
            filename: layer.filename,
            color: LAYER_COLORS[layer.type] || '#808080',
            fills: geometry.fills,
            strokes: geometry.strokes,
        };
    });
}

/**
 * Board bounds used for every export of a job so that copper, drill and outline
 * files of the same board line up: the outline layer when present, otherwise the
 * union of all enabled layers.
 */
export function boardBounds(layers) {
    const outline = layers.find(l => l.enabled !== false && l.type === 'outline');
    if (outline) {
        const b = ringsBounds(getLayerGeometry(outline).fills);
        if (b) return b;
    }
    const all = layers.filter(l => l.enabled !== false).map(l => ({ fills: getLayerGeometry(l).fills }));
    return combinedBounds(all);
}

/** Map the visibility toggles of the viewer onto geometry layer types. */
export function typesFromToggles(isToggled, side) {
    const sideKey = side === 'bottom' ? 'bottomlayer' : 'toplayer';
    const types = new Set();
    if (isToggled[sideKey]?.trace || isToggled[sideKey]?.pads) types.add('copper');
    if (isToggled[sideKey]?.silkscreen) types.add('silkscreen');
    if (isToggled.commonlayer?.outline) types.add('outline');
    if (isToggled.commonlayer?.drill) types.add('drill');
    return types;
}
