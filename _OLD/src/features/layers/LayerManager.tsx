import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Trash2, GripVertical, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { PCBLayer } from '~types/pcb';

interface LayerManagerProps {
    layers: PCBLayer[];
    onToggleVisibility: (id: string) => void;
    onColorChange: (id: string, color: string) => void;
    onDeleteLayer: (id: string) => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({
    layers,
    onToggleVisibility,
    onColorChange,
    onDeleteLayer
}) => {
    const [expanded, setExpanded] = useState({
        front: true,
        back: true,
        others: true
    });

    const toggleGroup = (key: keyof typeof expanded) => {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const groups = useMemo(() => {
        // Sort layers by priority for display
        const sorted = [...layers].sort((a, b) => {
            const priority = (type: string) => {
                const t = type.toLowerCase();
                if (t.includes('cu')) return 1;
                if (t.includes('mask')) return 2;
                if (t.includes('silk')) return 3;
                return 4;
            };
            const pA = priority(a.type);
            const pB = priority(b.type);
            if (pA !== pB) return pA - pB;
            return a.name.localeCompare(b.name);
        });

        return {
            front: sorted.filter(l => l.side === 'front'),
            back: sorted.filter(l => l.side === 'back'),
            others: sorted.filter(l => l.side !== 'front' && l.side !== 'back')
        };
    }, [layers]);

    if (layers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-zinc-500 text-sm text-center h-full">
                <Layers className="w-8 h-8 mb-2 opacity-20" />
                <p className="font-medium">No layers loaded</p>
                <p className="mt-1 text-xs opacity-60">Upload Gerber files to begin</p>
            </div>
        );
    }

    const renderLayer = (layer: PCBLayer) => (
        <div
            key={layer.id}
            className="group flex items-center gap-2 p-2 pl-3 rounded hover:bg-zinc-800/50 transition-colors border-l-2 border-transparent hover:border-zinc-700"
        >
            {/* Visibility Toggle */}
            <button
                onClick={() => onToggleVisibility(layer.id)}
                className="text-zinc-400 hover:text-zinc-100 focus:outline-none"
                title={layer.visible ? "Hide Layer" : "Show Layer"}
            >
                {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                )}
            </button>

            {/* Color Picker */}
            <div className="relative flex-shrink-0 group/color">
                <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => onColorChange(layer.id, e.target.value)}
                    className="w-3.5 h-3.5 p-0 border-0 rounded-full overflow-hidden cursor-pointer opacity-0 absolute inset-0 z-10"
                />
                <div
                    className="w-3.5 h-3.5 rounded-full border border-zinc-600 shadow-sm group-hover/color:scale-110 transition-transform"
                    style={{ backgroundColor: layer.color }}
                />
            </div>

            {/* Layer Name & Info */}
            <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-xs font-medium text-zinc-300 truncate" title={layer.name}>
                    {layer.name}
                </span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-tight flex items-center gap-1">
                    {layer.type}
                </span>
            </div>

            {/* Delete Action */}
            <button
                onClick={() => onDeleteLayer(layer.id)}
                className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                title="Remove Layer"
            >
                <Trash2 className="w-3 h-3" />
            </button>
        </div>
    );

    return (
        <div className="flex flex-col w-full">
            {/* Front Layers */}
            {groups.front.length > 0 && (
                <div className="mb-2">
                    <button
                        onClick={() => toggleGroup('front')}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
                    >
                        <div className="flex items-center gap-1.5">
                            {expanded.front ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Front Layers
                        </div>
                        <span className="bg-zinc-800 text-zinc-400 px-1.5 rounded-sm">{groups.front.length}</span>
                    </button>
                    {expanded.front && (
                        <div className="flex flex-col gap-0.5">
                            {groups.front.map(renderLayer)}
                        </div>
                    )}
                </div>
            )}

            {/* Back Layers */}
            {groups.back.length > 0 && (
                <div className="mb-2">
                    <button
                        onClick={() => toggleGroup('back')}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
                    >
                        <div className="flex items-center gap-1.5">
                            {expanded.back ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Back Layers
                        </div>
                        <span className="bg-zinc-800 text-zinc-400 px-1.5 rounded-sm">{groups.back.length}</span>
                    </button>
                    {expanded.back && (
                        <div className="flex flex-col gap-0.5">
                            {groups.back.map(renderLayer)}
                        </div>
                    )}
                </div>
            )}

            {/* Other Layers */}
            {groups.others.length > 0 && (
                <div className="mb-2">
                    <button
                        onClick={() => toggleGroup('others')}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
                    >
                        <div className="flex items-center gap-1.5">
                            {expanded.others ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Other Layers
                        </div>
                        <span className="bg-zinc-800 text-zinc-400 px-1.5 rounded-sm">{groups.others.length}</span>
                    </button>
                    {expanded.others && (
                        <div className="flex flex-col gap-0.5">
                            {groups.others.map(renderLayer)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
