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

const SIDE_TYPES = ['copper', 'soldermask', 'solderpaste', 'silkscreen', 'drawing'];
const COMMON_TYPES = ['outline', 'drill'];
// Layers that are only exported when the preview actually shows a group for them.
const HIDDEN_BY_DEFAULT = new Set(['soldermask']);

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

function toExportLayer(layer) {
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
}

/**
 * Build export layers (geometry + colour) for one or more sides of the board.
 * layers: context layers [{filename, gerber, type, side, enabled}]
 * sides: ['top'] | ['bottom'] | ['top', 'bottom']
 * typesFor: optional (side) => Set of layer types to include for that side
 *           (common 'all' layers use the first side's set).
 */
export function buildExportLayers(layers, { sides = ['top'], typesFor = null } = {}) {
    const enabled = layers.filter(l => l.enabled !== false);
    const selected = [];
    for (const side of sides) {
        const types = typesFor ? typesFor(side) : null;
        for (const layer of enabled) {
            if (layer.side !== side) continue;
            if (!types || types.has(layer.type)) selected.push(layer);
        }
    }
    const commonTypes = typesFor ? typesFor(sides[0]) : null;
    for (const layer of enabled) {
        if (layer.side !== 'all') continue;
        if (!commonTypes || commonTypes.has(layer.type)) selected.push(layer);
    }
    selected.sort((a, b) => LAYER_ORDER.indexOf(a.type) - LAYER_ORDER.indexOf(b.type));
    return selected.map(toExportLayer);
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

function isDisplayed(el, root) {
    for (let node = el; node && node !== root; node = node.parentElement) {
        if (node.style && node.style.display === 'none') return false;
    }
    return true;
}

/**
 * Derive the layer types to export from what the preview SVG currently shows.
 * The viewer toggles layers by setting inline `display` on groups whose ids
 * contain `<side>_<type>` (pcb-stackup: `<hash>_top_copper`, `<hash>_top_drill1`;
 * full-layer view: `g-top_copper`, `g-all_drill`), so the DOM is the single
 * source of truth for visibility rather than the toggle state object.
 */
export function visibleTypesFromPreview(root, side) {
    const types = new Set();
    if (!root) return types;
    const candidates = Array.from(root.querySelectorAll('g[id], clipPath[id]'))
        .filter(el => !el.closest('defs, mask'));

    const check = (type, matcher) => {
        const groups = candidates.filter(el => matcher(el.id));
        if (groups.length === 0) {
            if (!HIDDEN_BY_DEFAULT.has(type)) types.add(type);
        } else if (groups.some(el => isDisplayed(el, root))) {
            types.add(type);
        }
    };

    for (const type of SIDE_TYPES) check(type, id => id.includes(`${side}_${type}`));
    for (const type of COMMON_TYPES) check(type, id => id.includes(type));
    return types;
}
