
import JSZip from 'jszip';
import { PCBLayer } from '~types/pcb';
import { GerberToPath } from './vectorUtils'; // Keep for SVG bounds or cleanup later
import { convertGerberToSvg } from './gerberToSvgWrapper';
import { rasterizeLayer } from './rasterize';

/**
 * Heuristics for detecting Gerber layer types from filenames
 */
const LAYER_HEURISTICS: Record<string, { type: string; side: 'front' | 'back' | 'internal' | 'board' }> = {
    // Common KiCad / Altium / Eagle patterns
    'f_cu': { type: 'F.Cu', side: 'front' },
    'gtl': { type: 'F.Cu', side: 'front' },
    'top.gbr': { type: 'F.Cu', side: 'front' },

    'b_cu': { type: 'B.Cu', side: 'back' },
    'gbl': { type: 'B.Cu', side: 'back' },
    'bot.gbr': { type: 'B.Cu', side: 'back' },

    'f_mask': { type: 'F.Mask', side: 'front' },
    'gts': { type: 'F.Mask', side: 'front' },

    'b_mask': { type: 'B.Mask', side: 'back' },
    'gbs': { type: 'B.Mask', side: 'back' },

    'f_silk': { type: 'F.SilkS', side: 'front' },
    'gto': { type: 'F.SilkS', side: 'front' },

    'b_silk': { type: 'B.SilkS', side: 'back' },
    'gbo': { type: 'B.SilkS', side: 'back' },

    'edge_cuts': { type: 'Edge.Cuts', side: 'board' },
    'gko': { type: 'Edge.Cuts', side: 'board' },
    'gm1': { type: 'Edge.Cuts', side: 'board' },
};

export const parseGerberZip = async (file: File): Promise<PCBLayer[]> => {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    const layers: PCBLayer[] = [];


    const entries = Object.entries(contents.files);

    for (const [filename, zipEntry] of entries) {
        if (zipEntry.dir || !filename.match(/\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gko|gm[0-9]|drl|xln|svg|txt)$/i)) {
            continue;
        }

        const content = await zipEntry.async('string');
        const layer = await processGerberFile(filename, content);
        if (layer) {
            layers.push(layer);
        }
    }

    return layers;
};

export const parseGerberFiles = async (files: File[]): Promise<PCBLayer[]> => {
    const layers: PCBLayer[] = [];

    for (const file of files) {
        if (!file.name.match(/\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gko|gm[0-9]|drl|xln|txt|svg)$/i)) {
            continue;
        }

        const content = await file.text();
        const layer = await processGerberFile(file.name, content);
        if (layer) {
            layers.push(layer);
        }
    }
    return layers;
};

// Refactored helper to process a single file content (shared by zip and direct upload)
const processGerberFile = async (filename: string, content: string): Promise<PCBLayer | null> => {
    let path = '';
    let outline = '';
    let sourceFormat: 'gerber' | 'svg' = 'gerber';
    let layerBounds = undefined;
    let simplifiedContent: string | undefined = undefined;
    const layerId = crypto.randomUUID();

    if (filename.toLowerCase().endsWith('.svg')) {
        sourceFormat = 'svg';
        const matches = content.match(/d="([^"]+)"/g);
        if (matches) {
            path = matches.map(m => m.slice(3, -1)).join(' ');
            outline = path;
        }
    } else {
        const basic = GerberToPath.convert(content);
        outline = basic.path;

        try {
            const result = await convertGerberToSvg(content, filename);
            path = result.svg;
            layerBounds = result.bounds;
            sourceFormat = 'svg';

            if (!layerBounds || layerBounds.width <= 0) {
                layerBounds = basic.bounds;
            }
            simplifiedContent = path;

        } catch (e) {
            console.warn(`Standard parser failed for ${filename}, using basic fallback`, e);
            path = basic.path;
            layerBounds = basic.bounds;
            sourceFormat = 'gerber';
        }
    }

    const lowerName = filename.toLowerCase();
    // Improved heuristics for layer detection
    // We check for specific extensions first, then content/filenames

    // Default to Unknown if no match
    let detection: { type: string; side: 'front' | 'back' | 'internal' | 'board' } = { type: 'Unknown', side: 'internal' };

    // 1. Check strict extension matches (Protel/Standard styles)
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext) {
        if (['gtl', 'top', 'cmp'].includes(ext)) detection = { type: 'F.Cu', side: 'front' };
        else if (['gbl', 'bot', 'sol'].includes(ext)) detection = { type: 'B.Cu', side: 'back' };
        else if (['gts', 'stc', 'smt'].includes(ext)) detection = { type: 'F.Mask', side: 'front' };
        else if (['gbs', 'sts', 'smb'].includes(ext)) detection = { type: 'B.Mask', side: 'back' };
        else if (['gto', 'sst', 'plc'].includes(ext)) detection = { type: 'F.SilkS', side: 'front' };
        else if (['gbo', 'ssb', 'pls'].includes(ext)) detection = { type: 'B.SilkS', side: 'back' };
        else if (['gko', 'gm1', 'gm2', 'dim', 'mil', 'gml'].includes(ext)) detection = { type: 'Edge.Cuts', side: 'board' };
        else if (['drl', 'txt', 'xln', 'drd'].includes(ext)) detection = { type: 'Drill', side: 'board' };
    }

    // 2. If still unknown (or generic .gbr), check filename patterns (KiCad/Altium descriptive names)
    if (detection.type === 'Unknown') {
        const lower = filename.toLowerCase();
        if (lower.includes('f_cu') || lower.includes('f.cu') || lower.includes('top layer')) detection = { type: 'F.Cu', side: 'front' };
        else if (lower.includes('b_cu') || lower.includes('b.cu') || lower.includes('bottom layer')) detection = { type: 'B.Cu', side: 'back' };
        else if (lower.includes('f_mask') || lower.includes('f.mask') || lower.includes('top solder')) detection = { type: 'F.Mask', side: 'front' };
        else if (lower.includes('b_mask') || lower.includes('b.mask') || lower.includes('bottom solder')) detection = { type: 'B.Mask', side: 'back' };
        else if (lower.includes('f_silk') || lower.includes('f.silk') || lower.includes('top overlay')) detection = { type: 'F.SilkS', side: 'front' };
        else if (lower.includes('b_silk') || lower.includes('b.silk') || lower.includes('bottom overlay')) detection = { type: 'B.SilkS', side: 'back' };
        else if (lower.includes('edge') || lower.includes('profile') || lower.includes('outline') || lower.includes('board')) detection = { type: 'Edge.Cuts', side: 'board' };
    }

    // 3. Fallback for generic .gbr if we really found nothing else, 
    // but try not to force F.Cu unless it looks slightly like it
    if (detection.type === 'Unknown' && lowerName.endsWith('.gbr')) {
        // If we really can't tell, maybe F.Cu is a safe bet for a single file upload?
        // But for multi-file, it's dangerous. 
        // Let's leave it as Unknown or map to a "Generic" layer that defaults to front.
        detection = { type: 'Generic Gerber', side: 'front' };
    }

    // Raster Preview
    let raster = undefined;
    if (path && layerBounds && layerBounds.width > 0) {
        try {
            // Determine color based on type
            const color = getDefaultColor(detection.type);
            raster = await rasterizeLayer(path, layerBounds, color);
        } catch (err) {
            console.warn(`Rasterization failed for ${filename}`, err);
        }
    }

    return {
        id: layerId,
        name: filename,
        type: detection.type,
        side: detection.side as any,
        content: path,
        visible: detection.side !== 'internal',
        color: getDefaultColor(detection.type),
        mirrored: detection.side === 'back',
        inverted: false,
        speed: 100,
        power: 20,
        frequency: 40,
        sourceFormat,
        bounds: layerBounds,
        invertPadding: 2,
        outline: outline,
        simplifiedContent: simplifiedContent,
        raster: raster
    };
};

const getDefaultColor = (type: string): string => {
    if (type.includes('Cu')) return '#b87333'; // Copper color
    if (type.includes('F.Cu')) return '#b87333';
    if (type.includes('B.Cu')) return '#8b4513'; // Darker copper for bottom?
    if (type.includes('Silk')) return '#ffffff'; // White silk
    if (type.includes('Mask')) return '#006400'; // Green mask
    if (type.includes('Edge')) return '#ffff00'; // Yellow cuts
    return '#cccccc';
};
