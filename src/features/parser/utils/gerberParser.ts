
import JSZip from 'jszip';
import { PCBLayer } from '~types/pcb';
import { GerberToPath } from './vectorUtils'; // Keep for SVG bounds or cleanup later
import { convertGerberToSvg } from './gerberToSvgWrapper';

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
        if (zipEntry.dir || !filename.match(/\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gko|gm[0-9]|drl|xln|svg)$/i)) {
            continue;
        }

        const content = await zipEntry.async('string');
        let path = '';
        let outline = '';
        let sourceFormat: 'gerber' | 'svg' = 'gerber';
        let layerBounds = undefined;
        let simplifiedContent: string | undefined = undefined; // For inversion
        const layerId = crypto.randomUUID();

        if (filename.toLowerCase().endsWith('.svg')) {
            sourceFormat = 'svg';
            const matches = content.match(/d="([^"]+)"/g);
            if (matches) {
                path = matches.map(m => m.slice(3, -1)).join(' ');
                outline = path;
            }
        } else {
            // Compute basic outline always for metadata/fallback
            const basic = GerberToPath.convert(content);
            outline = basic.path;

            try {
                // 1. Standard Display (Filled / Normal)
                const result = await convertGerberToSvg(content, filename);
                path = result.svg;
                layerBounds = result.bounds;
                sourceFormat = 'svg';

                if (!layerBounds || layerBounds.width <= 0) {
                    layerBounds = basic.bounds;
                }

                // 2. Simplified/Outline for Inversion (Contour Mode) for Math Engine
                try {
                    const simplifiedResult = await convertGerberToSvg(content, filename, { plotAsOutline: true });
                    simplifiedContent = simplifiedResult.svg;
                } catch (err) {
                    console.warn("Simplified generation failed for inversion, falling back to standard content", err);
                    simplifiedContent = undefined; // Inversion will use path
                }

            } catch (e) {
                console.warn(`Standard parser failed for ${filename}, using basic fallback`, e);
                path = basic.path;
                layerBounds = basic.bounds;
                sourceFormat = 'gerber';
            }
        }

        const lowerName = filename.toLowerCase();
        let detection: { type: string; side: 'front' | 'back' | 'internal' | 'board' } = { type: 'Unknown', side: 'internal' };
        for (const [pattern, info] of Object.entries(LAYER_HEURISTICS)) {
            if (lowerName.includes(pattern)) {
                detection = info as any;
                break;
            }
        }

        const layer: PCBLayer = {
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
            simplifiedContent: simplifiedContent
        };
        layers.push(layer);
    }

    return layers;
};

const getDefaultColor = (type: string): string => {
    if (type.includes('Cu')) return '#b87333'; // Copper color
    if (type.includes('Silk')) return '#ffffff'; // White silk
    if (type.includes('Mask')) return '#006400'; // Green mask
    return '#cccccc';
};
