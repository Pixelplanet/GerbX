import { useState, useCallback } from 'react';
import { PCBLayer } from '~types/pcb';
import { VectorProcessor } from '../utils/vectorProcessor';
import { GerberToPath } from '../utils/vectorUtils';

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

            setProcessedLayers(processed);
        } catch (error) {
            console.error("Vector Processing Failed:", error);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return { processLayers, processedLayers, isProcessing };
};
