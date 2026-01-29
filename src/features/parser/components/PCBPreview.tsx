import React, { useMemo, useState, useRef, useEffect } from 'react';
import { PCBLayer } from '~types/pcb';
import { GerberToPath } from '../utils/vectorUtils';
import { Maximize2, ZoomIn, ZoomOut, Move } from 'lucide-react';

interface PCBPreviewProps {
    layers: PCBLayer[];
    viewMode: 'front' | 'back' | 'xray';
}

export const PCBPreview: React.FC<PCBPreviewProps> = ({ layers, viewMode }) => {
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<SVGSVGElement>(null);

    const visibleLayers = useMemo(() => {
        return layers.filter(layer => {
            if (!layer.visible) return false;
            if (layer.side === 'board') return true; // Always show board outline
            if (viewMode === 'front') return layer.side === 'front';
            if (viewMode === 'back') return layer.side === 'back';
            if (viewMode === 'xray') return true;
            return true;
        });
    }, [layers, viewMode]);

    const bounds = useMemo(() => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasAny = false;

        layers.forEach(layer => {
            if (!layer.visible) return;

            let b = layer.bounds;
            if (!b && layer.content) {
                // Fallback for SVG paths (using existing helper)
                b = GerberToPath.getBounds([{ content: layer.content }]);
            }

            if (b) {
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasAny = true;
            }
        });

        if (!hasAny) return { x: 0, y: 0, width: 100, height: 100 };
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }, [layers]);

    // Padding for the initial view
    const padding = Math.max(bounds.width, bounds.height) * 0.1 || 10;

    // Initial viewBox parameters
    const baseViewBox = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        w: bounds.width + padding * 2,
        h: bounds.height + padding * 2
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelRaw = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 20));
        };

        container.addEventListener('wheel', handleWheelRaw, { passive: false });
        return () => container.removeEventListener('wheel', handleWheelRaw);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) { // Left or middle click
            setIsDragging(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const dx = (e.clientX - lastMousePos.x) / zoom;
            const dy = (e.clientY - lastMousePos.y) / zoom;

            // Adjust offset based on SVG coordinates
            // This is a simplification; for perfect pan we'd need container size
            setOffset(prev => ({
                x: prev.x - dx,
                y: prev.y - dy
            }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const resetView = () => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    };

    // Construct final viewBox
    const viewBox = `${baseViewBox.x + offset.x} ${baseViewBox.y + offset.y} ${baseViewBox.w / zoom} ${baseViewBox.h / zoom}`;

    return (
        <div
            className="relative w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-700 cursor-grab active:cursor-grabbing overflow-hidden rounded-3xl"
        >
            {/* Simulation of a real PCB board substrate */}
            <div className="absolute inset-0 bg-[#0a1a0c] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')] pointer-events-none" />
                {viewMode === 'xray' && (
                    <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
                )}
            </div>

            {/* Viewport UI Controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30">
                <button
                    onClick={() => setZoom(z => z * 1.2)}
                    className="p-2 glass hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-all"
                >
                    <ZoomIn size={18} />
                </button>
                <button
                    onClick={() => setZoom(z => z / 1.2)}
                    className="p-2 glass hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-all"
                >
                    <ZoomOut size={18} />
                </button>
                <button
                    onClick={resetView}
                    className="p-2 glass hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-all"
                >
                    <Maximize2 size={18} />
                </button>
            </div>

            {/* The Main Board Area */}
            <div className="flex-1 relative overflow-hidden bg-[#0a0a0a] rounded-3xl border border-white/5 inner-shadow">
                <svg
                    ref={containerRef}
                    viewBox={viewBox}
                    className="relative z-10 w-full h-full p-8 transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1)"
                    style={{
                        transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px) ${viewMode === 'back' ? 'scaleX(-1)' : ''}`,
                        transformOrigin: 'center',
                        filter: viewMode === 'xray' ? 'drop-shadow(0 0 8px rgba(59,130,246,0.3))' : 'none'
                    }}
                    onMouseDown={(e) => {
                        setIsDragging(true);
                        setLastMousePos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => {
                        if (isDragging) {
                            setOffset(prev => ({
                                x: prev.x + (e.clientX - lastMousePos.x),
                                y: prev.y + (e.clientY - lastMousePos.y)
                            }));
                            setLastMousePos({ x: e.clientX, y: e.clientY });
                        }
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                >
                    <defs>
                        <style>{`
                            path { vector-effect: non-scaling-stroke; }
                        `}</style>
                    </defs>
                    {/* Board Guideline */}
                    <rect
                        x={bounds.x} y={bounds.y}
                        width={bounds.width} height={bounds.height}
                        fill="rgba(255,255,255,0.02)"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={bounds.width / 400}
                        rx={bounds.width / 100}
                    />

                    <defs>
                        <style>{`
                        .mask-force-black * {
                            fill: black !important;
                            stroke: black !important;
                            opacity: 1 !important;
                        }
                    `}</style>
                    </defs>
                    <defs>
                        <mask id="board_mask">
                            <rect x={bounds.x - 10} y={bounds.y - 10} width={bounds.width + 20} height={bounds.height + 20} fill="black" />
                            <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="white" />
                        </mask>
                    </defs>

                    {/* Always render a Substrate background based on the board bounds */}
                    <rect
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        fill="#1a1a1a"
                        stroke="#333"
                        strokeWidth={0.5}
                        rx={2}
                    />

                    {visibleLayers.sort((a, b) => {
                        const priority = (layer: PCBLayer) => {
                            const t = layer.type.toLowerCase();
                            const s = layer.side;

                            if (s === 'board' || t.includes('edge') || t.includes('cut')) return 0; // Bottom-most
                            if (t.includes('cu') || t.includes('copper')) return 10; // Above everything except mask/silk
                            if (t.includes('mask')) return 20;
                            if (t.includes('silk')) return 30; // Top-most
                            return 5; // Other layers (paste, etc.) between board and copper
                        };

                        return priority(a) - priority(b);
                    }).map((layer) => {
                        const layerStyle = {
                            opacity: viewMode === 'xray' ? (layer.side === 'internal' ? 0.3 : 0.6) : 1,
                            mixBlendMode: viewMode === 'xray' ? 'screen' : 'normal' as any,
                            color: layer.color // For currentColor inheritance
                        };

                        if (layer.sourceFormat === 'gerber') {
                            // Library Output Rendering
                            if (layer.inverted) {
                                // Masking logic for Inverted Gerber
                                // We need to force validity of the mask.
                                // White = Keep (The background/plane)
                                // Black = Remove (The traces/content)

                                const maskId = `mask_${layer.id}`;
                                const padding = layer.invertPadding ?? 2;

                                // Determine the "Plate" shape for masking
                                // If board layer exists, use its simplified outline. 
                                // Otherwise use the layer bounds + padding.
                                const boardLayer = layers.find(l => l.side === 'board');

                                let plateElement;
                                if (boardLayer && boardLayer.outline) {
                                    // Use board outline as plate
                                    plateElement = <path d={boardLayer.outline} fill="white" stroke="none" />;
                                } else {
                                    // Use padded rect
                                    plateElement = <rect
                                        x={bounds.x - padding}
                                        y={bounds.y - padding}
                                        width={bounds.width + (padding * 2)}
                                        height={bounds.height + (padding * 2)}
                                        fill="white" stroke="none"
                                    />;
                                }

                                return (
                                    <g key={layer.id} className="transition-all duration-300 ease-out" style={layerStyle}>
                                        <mask id={maskId} maskUnits="userSpaceOnUse">
                                            {/* The Plate (White = Opaque) */}
                                            {plateElement}

                                            {/* The Traces (Black = Transparent/Cut) */}
                                            {layer.content?.trim().startsWith('<') ? (
                                                <g className="mask-force-black" dangerouslySetInnerHTML={{ __html: layer.content }} />
                                            ) : (
                                                <path d={layer.content} fill="black" stroke="none" />
                                            )}
                                        </mask>

                                        {/* The Visible Render (Color) */}
                                        {boardLayer && boardLayer.outline ? (
                                            <path d={boardLayer.outline} fill={layer.color} mask={`url(#${maskId})`} />
                                        ) : (
                                            <rect
                                                x={bounds.x - padding}
                                                y={bounds.y - padding}
                                                width={bounds.width + (padding * 2)}
                                                height={bounds.height + (padding * 2)}
                                                fill={layer.color}
                                                mask={`url(#${maskId})`}
                                            />
                                        )}
                                    </g>
                                );
                            } else {
                                // Standard Rendering (High-Quality Fragments)
                                if (layer.content?.trim().startsWith('<')) {
                                    console.log(`[v1.4.11] Rendering layer ${layer.id} with color ${layer.color} (Standard Mode)`);
                                    return (
                                        <g
                                            key={layer.id}
                                            dangerouslySetInnerHTML={{ __html: layer.content }}
                                            style={{
                                                ...layerStyle,
                                                fill: layer.color,
                                                stroke: layer.color,
                                                fillRule: 'evenodd',
                                                clipRule: 'evenodd'
                                            }}
                                            className="gerber-fragment-container transition-all duration-300 ease-out"
                                        />
                                    );
                                }

                                // Basic Path Rendering (Fallback or SVG files)
                                return (
                                    <path
                                        key={layer.id}
                                        d={layer.content}
                                        fill={layer.color}
                                        fillRule="evenodd"
                                        stroke={layer.color}
                                        strokeWidth={0.2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="transition-all duration-300 ease-out"
                                        style={layerStyle}
                                    />
                                );
                            }
                        } else {
                            // SVG Path Rendering (Existing Logic)
                            const isFilled = layer.inverted || layer.content?.includes('Z') || layer.sourceFormat === 'svg';
                            const pathData = layer.inverted
                                ? `M${bounds.x} ${bounds.y} h${bounds.width} v${bounds.height} h-${bounds.width} z ${layer.content || ''}`
                                : (layer.content || 'M0 0');

                            return (
                                <path
                                    key={layer.id + '-trace'}
                                    d={pathData}
                                    fill={isFilled ? layer.color : 'none'}
                                    fillOpacity={isFilled ? 0.9 : 0}
                                    fillRule="evenodd"
                                    stroke={layer.color}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="transition-all duration-300 ease-out"
                                    style={{
                                        ...layerStyle,
                                        strokeWidth: (bounds.width / 1000)
                                    }}
                                />
                            );
                        }
                    })}
                </svg>

                {/* CAD Corner Brackets */}
                <div className="absolute top-6 left-6 w-8 h-8 pointer-events-none opacity-40">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-brand-accent" />
                    <div className="absolute top-0 left-0 w-[1px] h-full bg-brand-accent" />
                </div>
                <div className="absolute top-6 right-6 w-8 h-8 pointer-events-none opacity-40">
                    <div className="absolute top-0 right-0 w-full h-[1px] bg-brand-accent" />
                    <div className="absolute top-0 right-0 w-[1px] h-full bg-brand-accent" />
                </div>
                <div className="absolute bottom-6 left-6 w-8 h-8 pointer-events-none opacity-40">
                    <div className="absolute bottom-0 left-0 w-full h-[1px] bg-brand-accent" />
                    <div className="absolute bottom-0 left-0 w-[1px] h-full bg-brand-accent" />
                </div>
                <div className="absolute bottom-6 right-6 w-8 h-8 pointer-events-none opacity-40">
                    <div className="absolute bottom-0 right-0 w-full h-[1px] bg-brand-accent" />
                    <div className="absolute bottom-0 right-0 w-[1px] h-full bg-brand-accent" />
                </div>
            </div>
        </div>
    );
};
