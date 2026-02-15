import { useState, useCallback } from 'react';
import { PCBLayer } from '~types/pcb';
import { VectorProcessor } from '../utils/vectorProcessor';
import { GerberToPath } from '../utils/vectorUtils';
import { rasterizeLayer } from '../utils/rasterize';

export const useProcessor = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedLayers, setProcessedLayers] = useState<PCBLayer[]>([]);

    const processLayers = useCallback(async (layers: PCBLayer[], bounds: any) => {
        if (layers.length === 0) return;
        setIsProcessing(true);

        // Allow UI to update before blocking calculation
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const processed = layers.map((layer: PCBLayer) => {
                let content = layer.content;
                let layerBounds = layer.bounds;

                // 1. Handle Inversion (Copper layers usually inverted for high-power laser removal)
                if (layer.inverted) {
                    // Prefer simplified content (polygons) for boolean operations as it avoids thousands of stroke primitives
                    const inputContent = layer.simplifiedContent || layer.content;
                    content = VectorProcessor.invert(inputContent, bounds, layer.invertPadding || 2);
                    // Recalculate bounds after inversion
                    layerBounds = GerberToPath.calculatePathBounds(content);
                    // IMPORTANT: We must set inverted to false here because we have physically modified the geometry
                    // to be the negative image. We want the renderer to treat it as a normal positive shape now.
                    return { ...layer, content, bounds: layerBounds, inverted: false };
                }

                return { ...layer, content, bounds: layerBounds };
            });

            // 2. Generate/Update Raster images for all processed layers
            const processedWithRasters = await Promise.all(processed.map(async (layer) => {
                if (layer.content && layer.bounds && layer.bounds.width > 0) {
                    try {
                        const raster = await rasterizeLayer(layer.content, layer.bounds, layer.color);
                        return { ...layer, raster };
                    } catch (err) {
                        console.warn(`Rasterization failed for layer ${layer.name}`, err);
                    }
                }
                return layer;
            }));

            setProcessedLayers(processedWithRasters);
        } catch (error) {
            console.error("Vector Processing Failed:", error);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return { processLayers, processedLayers, isProcessing };
};
