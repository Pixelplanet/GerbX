import { useCallback } from 'react';
import { PCBLayer } from '~types/pcb';
import { XCSGenerator } from '../utils/xcsGenerator';

export const useExport = () => {

    const extractPathsFromSvg = (svgContent: string): string[] => {
        const paths: string[] = [];
        // Simple regex to extract d attributes. 
        // Note: This matches d="..." attributes. 
        // If gerber-to-svg outputs standard SVGs, this should catch most paths.
        // We might want to handle single vs double quotes?
        const regex = /d=["']([^"']+)["']/g;
        let match;
        while ((match = regex.exec(svgContent)) !== null) {
            paths.push(match[1]);
        }
        return paths;
    };

    const downloadSvg = useCallback((layers: PCBLayer[], filename: string = 'pcb_export.svg') => {
        if (!layers.length) return;

        // Calculate combined bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layers.forEach(l => {
            if (!l.visible) return;
            if (l.bounds) {
                minX = Math.min(minX, l.bounds.x);
                minY = Math.min(minY, l.bounds.y);
                maxX = Math.max(maxX, l.bounds.x + l.bounds.width);
                maxY = Math.max(maxY, l.bounds.y + l.bounds.height);
            }
        });

        if (minX === Infinity) return;

        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 10; // mm

        const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width + padding * 2}mm" height="${height + padding * 2}mm">`;

        // Add style for non-scaling stroke if needed, or just standard styles
        svgContent += `<style>path { vector-effect: non-scaling-stroke; }</style>`;

        // Add a background rect? No, keep transparent.

        // Sort layers (using z-order logic from PCBPreview if possible, or just index)
        // PCBPreview sorting logic: Board -> Copper -> Mask -> Silk
        // specific logic repeated here or assume 'layers' is already sorted? 
        // The 'layers' passed here usually comes from state, which might not be sorted by Z.
        // Let's implement basic sorting to ensure correct stacking in the SVG.
        const sortedLayers = [...layers].sort((a, b) => {
            const priority = (layer: PCBLayer) => {
                const t = layer.type.toLowerCase();
                if (layer.side === 'board' || t.includes('edge')) return 0;
                if (t.includes('cu')) return 10;
                if (t.includes('mask')) return 20;
                if (t.includes('silk')) return 30;
                return 5;
            };
            return priority(a) - priority(b);
        });

        sortedLayers.forEach(layer => {
            if (!layer.visible) return;

            // We wrap each layer in a group with its color
            // layer.content is ALREADY a <g> or <svg> fragment (from gerber-to-svg wrapper)
            // If it's a list of paths (legacy), we assume it's SVG content.

            // We need to inject the color if the fragment uses 'currentColor'
            // Our new wrapper outputs <g>... with stroke="currentColor".
            // So setting color on the wrapper group works.

            svgContent += `<g id="${layer.name}" color="${layer.color}" fill="${layer.color}" stroke="${layer.color}">`;
            svgContent += layer.content;
            svgContent += `</g>`;
        });

        svgContent += `</svg>`;

        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    const downloadXcs = useCallback((layers: PCBLayer[], filename: string = 'pcb_export.xcs') => {
        if (!layers.length) return;

        // Map to XCS Generator format
        // generator.generate(imageData, xcsLayers, size)

        const xcsLayers = layers.filter(l => l.visible).map(layer => {
            return {
                name: layer.name,
                visible: true,
                color: { r: 0, g: 0, b: 0 }, // Hex to RGB? XCSGenerator expects {r,g,b} object?
                // XCSGenerator.js:40 uses layer.color. 
                // line 111: this.rgbToHex(layer.color). 
                // Wait, if layer.color is a STRING (hex) in PCBLayer, this might fail in XCSGenerator if it expects object.
                // PCBLayer definition: color: string;
                // XCSGenerator rgbToHex expects object with r,g,b.
                // WE MUST CONVERT HEX TO RGB OBJECT.

                paths: extractPathsFromSvg(layer.content || ''),
                speed: layer.speed,
                power: layer.power,
                passes: 1, // field 'passes' vs 'repeat'
                frequency: layer.frequency,
                // Add default settings if needed
            };
        });

        // Convert hex color to rgb object helper
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        };

        // Fix colors in the mapped layers
        xcsLayers.forEach((l, i) => {
            const originalLayer = layers.find(ol => ol.name === l.name);
            if (originalLayer) {
                l.color = hexToRgb(originalLayer.color);
            }
        });

        const generator = new XCSGenerator({
            activeDevice: 'f2_ultra_uv', // Default or grab from settings?
            speed: 100,
            power: 10
        });

        // Calculate size from bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layers.forEach(l => {
            if (l.visible && l.bounds) {
                minX = Math.min(minX, l.bounds.x);
                minY = Math.min(minY, l.bounds.y);
                maxX = Math.max(maxX, l.bounds.x + l.bounds.width);
                maxY = Math.max(maxY, l.bounds.y + l.bounds.height);
            }
        });
        // Normalize size? XCS usually centers it?
        // XCS Generator seems to use the paths directly. 
        // We should probably normalize coordinates to start at 0,0?
        // XCS generator line 48: `createPathDisplayWithPath`. 
        // It calls `calculateBoundsAndTighten`. It seems to handle positioning.

        const size = { width: maxX - minX, height: maxY - minY };

        const content = generator.generate(null, xcsLayers, size);

        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    }, []);

    return { downloadSvg, downloadXcs };
};
