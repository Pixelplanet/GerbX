import React, { useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { PCBLayer } from '~types/pcb';

interface GerberViewerProps {
    layers: PCBLayer[];
}

export const GerberViewer: React.FC<GerberViewerProps> = ({ layers }) => {
    // Determine global bounds for the canvas
    const bounds = useMemo(() => {
        if (layers.length === 0) return { x: 0, y: 0, width: 100, height: 100 };

        // Find minX, minY, maxX, maxY across all visible layers
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let hasValidBounds = false;

        layers.forEach(layer => {
            if (!layer.visible || !layer.bounds) return;
            hasValidBounds = true;
            minX = Math.min(minX, layer.bounds.x);
            minY = Math.min(minY, layer.bounds.y);
            maxX = Math.max(maxX, layer.bounds.x + layer.bounds.width);
            maxY = Math.max(maxY, layer.bounds.y + layer.bounds.height);
        });

        if (!hasValidBounds) return { x: 0, y: 0, width: 100, height: 100 };

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }, [layers]);

    // Sort layers by Z-index priority (Copper > Mask > Silk)
    // or simply by order. Actually, bottom layers usually first.
    const sortedLayers = useMemo(() => {
        // We can just reverse them if top is last?
        // Typically rendering order:
        // 1. Board Outline
        // 2. Bottom Copper
        // 3. Bottom Mask
        // 4. Bottom Silk
        // 5. Top Copper
        // 6. Top Mask
        // 7. Top Silk

        // But opacity blending matters. 
        // For now, let's just render them in the order they come, 
        // but maybe we should ensure we don't occlude.
        // Let's rely on the input order for now or sort explicitly later if needed.
        return layers;
    }, [layers]);

    const padding = 2; // mm padding around bounds

    return (
        <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
            <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={50}
                centerOnInit={true}
                wheel={{ step: 0.1 }}
            >
                <TransformComponent
                    wrapperClass="w-full h-full"
                    contentClass="w-full h-full"
                >
                    <div
                        style={{
                            width: `${Math.max(100, bounds.width + padding * 2)}mm`,
                            height: `${Math.max(100, bounds.height + padding * 2)}mm`,
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                            // We create a container that roughly fits the board
                            // But acts as the infinite canvas "surface"
                        }}
                        className="bg-transparent"
                    >
                        {/* The PCB composition */}
                        <svg
                            width={`${bounds.width}mm`}
                            height={`${bounds.height}mm`}
                            viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
                            style={{
                                overflow: 'visible'
                            }}
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <style>{`path { stroke-linecap: round; stroke-linejoin: round; }`}</style>
                            </defs>

                            {sortedLayers.map(layer => (
                                <g
                                    key={layer.id}
                                    opacity={layer.visible ? 0.9 : 0}
                                    color={layer.color}
                                    fill={layer.color}
                                    stroke={layer.color}
                                    style={{
                                        mixBlendMode: 'screen',
                                        pointerEvents: 'none'
                                    }}
                                    dangerouslySetInnerHTML={{ __html: layer.content }}
                                />
                            ))}
                        </svg>
                    </div>
                </TransformComponent>
            </TransformWrapper>
        </div>
    );
};
