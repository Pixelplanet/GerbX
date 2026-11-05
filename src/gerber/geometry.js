import { createParser } from '@tracespace/parser';
import { plot } from '@tracespace/plotter';
import ClipperLib from 'clipper-lib';

const SCALE = 10000;                 // clipper integer units per mm (0.1 µm)
const CHORD_TOLERANCE_MM = 0.005;
const MIN_ARC_STEPS = 8;
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = ClipperLib;

function arcSteps(radius, sweep) {
    if (radius <= CHORD_TOLERANCE_MM) return MIN_ARC_STEPS;
    const stepAngle = 2 * Math.acos(1 - CHORD_TOLERANCE_MM / radius);
    return Math.max(MIN_ARC_STEPS, Math.ceil(Math.abs(sweep) / stepAngle));
}

function arcPoints(cx, cy, r, startTheta, endTheta, includeStart = true) {
    const sweep = endTheta - startTheta;
    const steps = arcSteps(r, sweep);
    const pts = [];
    for (let i = includeStart ? 0 : 1; i <= steps; i++) {
        const t = startTheta + (sweep * i) / steps;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return pts;
}

function circleRing(cx, cy, r) {
    const ring = arcPoints(cx, cy, r, 0, 2 * Math.PI);
    ring.pop();
    return ring;
}

function rectRing(x, y, w, h, r = 0) {
    if (!r || r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    r = Math.min(r, w / 2, h / 2);
    return [
        ...arcPoints(x + w - r, y + h - r, r, 0, Math.PI / 2),
        ...arcPoints(x + r, y + h - r, r, Math.PI / 2, Math.PI),
        ...arcPoints(x + r, y + r, r, Math.PI, 1.5 * Math.PI),
        ...arcPoints(x + w - r, y + r, r, 1.5 * Math.PI, 2 * Math.PI),
    ];
}

function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/** Chain path segments into polylines (mm). Arcs are tessellated. */
function segmentsToPolylines(segments) {
    const lines = [];
    let current = null;
    for (const seg of segments) {
        if (!current || !samePoint(current[current.length - 1], seg.start)) {
            current = [[seg.start[0], seg.start[1]]];
            lines.push(current);
        }
        if (seg.type === 'line') {
            current.push([seg.end[0], seg.end[1]]);
        } else {
            current.push(...arcPoints(seg.center[0], seg.center[1], seg.radius, seg.start[2], seg.end[2], false));
        }
    }
    return lines;
}

function toClipperPath(ring) {
    return ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
}

function orientPositive(path) {
    if (!Clipper.Orientation(path)) path.reverse();
    return path;
}

function simpleShapeToPaths(shape) {
    switch (shape.type) {
        case 'circle': return [circleRing(shape.cx, shape.cy, shape.r)];
        case 'rectangle': return [rectRing(shape.x, shape.y, shape.xSize, shape.ySize, shape.r)];
        case 'polygon': return [shape.points.map(p => [p[0], p[1]])];
        case 'outline': return segmentsToPolylines(shape.segments).filter(l => l.length >= 3);
        default: return [];
    }
}

function execute(clipType, subject, clip) {
    const c = new Clipper();
    c.AddPaths(subject, PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, PolyType.ptClip, true);
    const solution = [];
    c.Execute(clipType, solution, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
    return solution;
}

function unionPaths(paths) {
    return paths.length ? execute(ClipType.ctUnion, paths, []) : [];
}

function layeredShapeToPaths(shape) {
    let acc = [];
    for (const layer of shape.shapes) {
        const paths = simpleShapeToPaths(layer).map(r => orientPositive(toClipperPath(r)));
        if (!paths.length) continue;
        acc = layer.erase ? execute(ClipType.ctDifference, acc, paths) : execute(ClipType.ctUnion, acc, paths);
    }
    return acc;
}

function offsetPolylines(polylines, width) {
    const co = new ClipperOffset(2, CHORD_TOLERANCE_MM * SCALE);
    for (const line of polylines) {
        const path = toClipperPath(line);
        if (path.length === 1) path.push({ X: path[0].X, Y: path[0].Y });
        co.AddPath(path, JoinType.jtRound, EndType.etOpenRound);
    }
    const solution = [];
    co.Execute(solution, (width / 2) * SCALE);
    return solution;
}

/** Convert one plotted image tree into clipper paths (dark geometry only). */
function imageToPaths(image) {
    const paths = [];
    for (const child of image.children) {
        if (child.type === 'imageShape') {
            if (child.shape.type === 'layeredShape') paths.push(...layeredShapeToPaths(child.shape));
            else for (const r of simpleShapeToPaths(child.shape)) paths.push(orientPositive(toClipperPath(r)));
        } else if (child.type === 'imagePath') {
            if (child.width > 0) paths.push(...offsetPolylines(segmentsToPolylines(child.segments), child.width));
        } else if (child.type === 'imageRegion') {
            for (const r of segmentsToPolylines(child.segments)) if (r.length >= 3) paths.push(orientPositive(toClipperPath(r)));
        }
    }
    return unionPaths(paths);
}

/**
 * Split the parser tree into consecutive polarity runs. Each run is a full tree
 * (all state-carrying nodes kept) where graphics of the other polarity are
 * turned into moves so plotter position/modality stays correct.
 */
function splitByPolarity(tree) {
    const hasClear = tree.children.some(n => n.type === 'loadPolarity' && n.polarity === 'clear');
    if (!hasClear) return [{ polarity: 'dark', tree }];

    const runs = [];
    let polarity = 'dark';
    let runIndex = -1;
    const ownerByNode = new Map();
    for (const node of tree.children) {
        if (node.type === 'loadPolarity') { polarity = node.polarity; continue; }
        if (node.type !== 'graphic') continue;
        if (runIndex < 0 || runs[runIndex].polarity !== polarity) {
            runs.push({ polarity, count: 0 });
            runIndex++;
        }
        runs[runIndex].count++;
        ownerByNode.set(node, runIndex);
    }

    return runs.map((run, i) => ({
        polarity: run.polarity,
        tree: {
            ...tree,
            children: tree.children.map(node => {
                if (node.type !== 'graphic' || ownerByNode.get(node) === i) return node;
                if (node.graphic === 'move') return node;
                const coordinates = node.graphic === 'slot'
                    ? { x: node.coordinates.x2 ?? node.coordinates.x, y: node.coordinates.y2 ?? node.coordinates.y }
                    : node.coordinates;
                return { ...node, graphic: 'move', coordinates };
            }),
        },
    }));
}

function pathsToRings(paths, scale) {
    const k = scale / SCALE;
    return paths.map(path => path.map(p => [p.X * k, p.Y * k]));
}

function polylinesScaled(image, scale) {
    const strokes = [];
    for (const child of image.children) {
        if (child.type !== 'imagePath') continue;
        const polylines = segmentsToPolylines(child.segments).map(l => l.map(([x, y]) => [x * scale, y * scale]));
        strokes.push({ width: child.width * scale, polylines });
    }
    return strokes;
}

export function ringsBounds(rings) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return minX === Infinity ? null : [minX, minY, maxX, maxY];
}

/**
 * Parse a Gerber or Excellon file into resolved geometry in millimetres
 * (Gerber coordinate system, Y up).
 *
 * fills:   closed rings (outer rings positive orientation, holes negative) of the
 *          final image after unioning dark and subtracting clear polarity.
 * strokes: raw stroked centrelines {width, polylines} (useful for outlines/cuts).
 */
export function parseLayerGeometry(content) {
    const parser = createParser();
    parser.feed(content);
    const tree = parser.result();

    let result = [];
    let units = 'mm';
    let strokes = [];
    for (const run of splitByPolarity(tree)) {
        const image = plot(run.tree);
        units = image.units;
        const paths = imageToPaths(image);
        if (!result.length && run.polarity === 'dark') {
            result = paths;
        } else if (paths.length) {
            result = execute(run.polarity === 'dark' ? ClipType.ctUnion : ClipType.ctDifference, result, paths);
        }
        strokes.push(...polylinesScaled(image, units === 'in' ? 25.4 : 1));
    }
    const scale = units === 'in' ? 25.4 : 1;
    const fills = pathsToRings(result, scale);
    return { filetype: tree.filetype, units: 'mm', fills, strokes, bounds: ringsBounds(fills) };
}
