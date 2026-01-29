import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Package,
    Layers,
    Settings2,
    Download,
    Upload,
    Eye,
    EyeOff,
    FlipHorizontal,
    Cpu,
    Zap,
    Gauge,
    Activity,
    Maximize2,
    Trash2,
    ChevronRight,
    ChevronDown,
    ArrowRight,
    Monitor,
    Loader2
} from 'lucide-react';
import { FileUploader } from '@/features/upload/components/FileUploader';
import { parseGerberZip } from '@/features/parser/utils/gerberParser';
import { parseIPC2581 } from '@/features/parser/utils/ipcParser';
import { PCBPreview } from '@/features/parser/components/PCBPreview';
import { XCSGenerator } from '@/features/parser/utils/xcsGenerator';
import { useProcessor } from '@/features/parser/hooks/useProcessor';
import { PCBLayer } from '~types/pcb';
import { GerberToPath } from '@/features/parser/utils/vectorUtils';

const DEVICES = [
    { id: 'f2_ultra_uv', name: 'F2 Ultra UV' },
    { id: 'f2_ultra_base', name: 'F2 Ultra MOPA' }
];

const VERSION = "1.4.18";

const App: React.FC = () => {
    const [layers, setLayers] = useState<PCBLayer[]>([]);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'front' | 'back' | 'xray'>('front');
    const [activeDevice, setActiveDevice] = useState(DEVICES[0].id);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        front: true,
        back: true,
        others: true
    });

    const { processLayers, processedLayers, isProcessing: isGeometryProcessing } = useProcessor();
    const [isParsing, setIsParsing] = useState(false);

    const boardBounds = useMemo(() => {
        // 1. Try to find Edge.Cuts / Board layer
        const boardLayer = layers.find(l => l.side === 'board');
        if (boardLayer && boardLayer.bounds && boardLayer.bounds.width > 0) {
            return boardLayer.bounds;
        }

        // 2. Try to find union of copper layers (usually the best proxy for board size)
        const copperLayers = layers.filter(l => l.type.toLowerCase().includes('cu') || l.type.toLowerCase().includes('copper'));
        if (copperLayers.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let hasAny = false;
            copperLayers.forEach(l => {
                if (l.bounds && l.bounds.width > 0) {
                    minX = Math.min(minX, l.bounds.x);
                    minY = Math.min(minY, l.bounds.y);
                    maxX = Math.max(maxX, l.bounds.x + l.bounds.width);
                    maxY = Math.max(maxY, l.bounds.y + l.bounds.height);
                    hasAny = true;
                }
            });
            if (hasAny) {
                return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            }
        }

        // 3. Fallback to all layers
        return GerberToPath.getBounds(layers);
    }, [layers]);

    useEffect(() => {
        if (layers.length > 0) {
            processLayers(layers, boardBounds);
        }
    }, [layers, boardBounds, processLayers]);

    const selectedLayer = useMemo(() =>
        layers.find(l => l.id === selectedLayerId),
        [layers, selectedLayerId]);

    const handleFileAccepted = async (file: File) => {

        setIsParsing(true);
        try {
            let detectedLayers: PCBLayer[] = [];
            if (file.name.endsWith('.zip')) {
                detectedLayers = await parseGerberZip(file);
            } else if (file.name.endsWith('.xml')) {
                detectedLayers = await parseIPC2581(file);
            }

            const sorted = detectedLayers.sort((a, b) => {
                const priority = (type: string) => {
                    const t = type.toLowerCase();
                    if (t.includes('cu')) return 1;
                    if (t.includes('mask')) return 2;
                    if (t.includes('silk')) return 3;
                    return 4;
                };
                return priority(a.type) - priority(b.type);
            });

            setLayers(sorted);
            (window as any).debugLayers = sorted;

            if (sorted.length > 0) {
                setSelectedLayerId(sorted[0].id);
            }
        } catch (err) {
            console.error('Failed to parse file:', err);
        } finally {
            setIsParsing(false);
        }
    };

    const updateLayer = (id: string, updates: Partial<PCBLayer>) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const applyPreset = (type: 'COPPER' | 'MASK' | 'SILK' | 'FULL_CLEAR') => {
        setLayers(prev => prev.map(l => {
            const lowerType = l.type.toLowerCase();
            const isCopper = lowerType.includes('cu') || lowerType.includes('copper');
            const isMask = lowerType.includes('mask');
            const isSilk = lowerType.includes('silk');

            if (type === 'COPPER' && isCopper) {
                return { ...l, inverted: true, power: 80, speed: 100, visible: true };
            }
            if (type === 'MASK' && isMask) {
                return { ...l, inverted: false, power: 40, speed: 500, visible: true };
            }
            if (type === 'SILK' && isSilk) {
                return { ...l, inverted: false, power: 20, speed: 1000, visible: true };
            }
            if (type === 'FULL_CLEAR' && isCopper) {
                return { ...l, inverted: true, power: 100, speed: 50, visible: true };
            }
            return { ...l, visible: false };
        }));
    };

    const handleExportXCS = () => {
        const generator = new XCSGenerator({ activeDevice });
        const sourceLayers = processedLayers.length > 0 ? processedLayers : layers;
        const xcsLayers = sourceLayers.map(l => ({
            name: l.name,
            paths: [l.content],
            visible: l.visible,
            color: l.color,
            speed: l.speed,
            power: l.power,
            frequency: l.frequency,
            passes: 1
        }));
        const content = generator.generate(xcsLayers);

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GerbX_v${VERSION}_${new Date().getTime()}.xcs`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const renderLayerItem = (layer: PCBLayer) => (
        <div
            key={layer.id}
            onClick={() => setSelectedLayerId(layer.id)}
            className={`sidebar-item ${selectedLayerId === layer.id ? 'sidebar-item-active' : 'hover:bg-white/5'}`}
        >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{layer.name}</p>
                <p className="text-[9px] text-brand-text-muted uppercase tracking-tighter font-bold">{layer.type}</p>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                className="text-brand-text-muted hover:text-white"
            >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
        </div>
    );

    const groups = useMemo(() => {
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
            others: sorted.filter(l => l.side === 'internal' || (l.side !== 'front' && l.side !== 'back'))
        };
    }, [layers]);

    if (layers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-brand-bg p-6 text-brand-text">
                <div className="flex items-center gap-3 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-brand-accent p-2 rounded-xl shadow-lg shadow-brand-accent-glow">
                        <Package size={32} className="text-white" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-3xl font-extrabold tracking-tight leading-none">GerbX</h1>
                        <span className="text-[10px] text-brand-text-muted font-mono mt-1">ENGINE v{VERSION}</span>
                    </div>
                </div>

                <div className="glass p-12 max-w-2xl w-full text-center animate-in zoom-in-95 duration-500">
                    <h2 className="text-4xl font-bold mb-4">Laser Pipeline Ready</h2>
                    <p className="text-brand-text-muted mb-12 max-w-md mx-auto">
                        Drop your Gerber ZIP or IPC-2581 XML. We'll automatically build your fabrication stack.
                    </p>
                    <FileUploader onFilesAccepted={handleFileAccepted} isProcessing={isParsing || isGeometryProcessing} />
                </div>
            </div>
        );
    }

    // DEBUG OVERLAY
    const debugData = {
        layerCount: layers.length,
        processedCount: processedLayers.length,
        isProcessing: isGeometryProcessing,
        bounds: boardBounds,
        firstLayerPreamble: layers[0]?.content?.substring(0, 100) || 'N/A',
        selectedId: selectedLayerId,
        selectedInverted: selectedLayer?.inverted,
        processedInverted: processedLayers.find(p => p.id === selectedLayerId)?.inverted
    };

    return (
        <div className="flex flex-col h-screen bg-brand-bg text-brand-text overflow-hidden">
            <header className="h-16 flex items-center justify-between px-6 border-b border-brand-border backdrop-blur-md bg-brand-bg/50 sticky top-0 z-50">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 pr-4 border-r border-brand-border h-8">
                        <div className="bg-brand-accent p-1.5 rounded-lg">
                            <Package size={20} className="text-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight">GerbX</span>
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono text-brand-text-muted">v{VERSION}</span>
                    </div>

                    <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-brand-border max-w-[280px]">
                        {DEVICES.map(device => (
                            <button
                                key={device.id}
                                onClick={() => setActiveDevice(device.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all truncate whitespace-nowrap ${activeDevice === device.id ? 'bg-brand-accent text-white shadow-lg' : 'text-brand-text-muted hover:text-white'}`}
                            >
                                {device.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div onClick={() => applyPreset('COPPER')} className="text-[10px] font-black cursor-pointer hover:text-brand-accent transition-colors">COPPER</div>
                    <div onClick={() => applyPreset('MASK')} className="text-[10px] font-black cursor-pointer hover:text-brand-accent transition-colors">MASK</div>
                    <div onClick={() => applyPreset('SILK')} className="text-[10px] font-black cursor-pointer hover:text-brand-accent transition-colors">SILK</div>
                    <div className="w-[1px] h-4 bg-brand-border mx-2" />
                    <button onClick={handleExportXCS} className="btn-premium flex items-center gap-2 py-1.5 px-6">
                        <Download size={16} />
                        EXPORT .XCS
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                <aside className="w-80 border-r border-brand-border flex flex-col bg-brand-bg/80 backdrop-blur-xl">
                    <div className="p-4 flex-1 overflow-y-auto space-y-4">
                        {/* Front Group */}
                        {(viewMode === 'front' || viewMode === 'xray') && groups.front.length > 0 && (
                            <div>
                                <button
                                    onClick={() => toggleGroup('front')}
                                    className="w-full flex items-center justify-between mb-2 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider hover:text-white transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        {expandedGroups.front ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        FRONT LAYERS
                                    </div>
                                    <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded">{groups.front.length}</span>
                                </button>
                                {expandedGroups.front && (
                                    <div className="space-y-1 pl-2 border-l border-white/5 ml-1.5">
                                        {groups.front.map(renderLayerItem)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Back Group */}
                        {(viewMode === 'back' || viewMode === 'xray') && groups.back.length > 0 && (
                            <div>
                                <button
                                    onClick={() => toggleGroup('back')}
                                    className="w-full flex items-center justify-between mb-2 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider hover:text-white transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        {expandedGroups.back ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        BACK LAYERS
                                    </div>
                                    <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded">{groups.back.length}</span>
                                </button>
                                {expandedGroups.back && (
                                    <div className="space-y-1 pl-2 border-l border-white/5 ml-1.5">
                                        {groups.back.map(renderLayerItem)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Others Group */}
                        <div>
                            <button
                                onClick={() => toggleGroup('others')}
                                className="w-full flex items-center justify-between mb-2 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider hover:text-white transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {expandedGroups.others ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    OTHERS
                                </div>
                                <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded">{groups.others.length}</span>
                            </button>
                            {expandedGroups.others && (
                                <div className="space-y-1 pl-2 border-l border-white/5 ml-1.5">
                                    {groups.others.map(renderLayerItem)}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t border-brand-border bg-black/20">
                        <button onClick={() => { setLayers([]); setSelectedLayerId(null); }} className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-brand-text-muted hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                            Reset Workspace
                        </button>
                    </div>
                </aside>

                <main className="flex-1 relative bg-grid-pattern bg-repeat flex items-center justify-center p-12 overflow-hidden">
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex bg-black/40 backdrop-blur-lg border border-brand-border p-1 rounded-xl z-20 shadow-2xl">
                        <button onClick={() => setViewMode('front')} className={`px-8 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'front' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent-glow' : 'text-brand-text-muted hover:text-white'}`}>FRONT</button>
                        <button onClick={() => setViewMode('back')} className={`px-8 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'back' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent-glow' : 'text-brand-text-muted hover:text-white'}`}>BACK</button>
                        <button onClick={() => setViewMode('xray')} className={`px-8 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'xray' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent-glow' : 'text-brand-text-muted hover:text-white'}`}>X-RAY</button>
                    </div>

                    {isGeometryProcessing && (
                        <div className="absolute inset-0 z-40 bg-brand-bg/60 backdrop-blur-sm flex flex-col items-center justify-center">
                            <div className="bg-black/60 p-6 rounded-2xl border border-white/10 flex flex-col items-center gap-4 shadow-2xl">
                                <Loader2 className="animate-spin text-brand-accent" size={32} />
                                <div className="text-center">
                                    <p className="text-sm font-bold tracking-tight">Processing Geometry</p>
                                    <p className="text-[10px] text-brand-text-muted uppercase tracking-widest font-black mt-1">Applying Inversion & Mirroring</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="w-full h-full max-w-5xl max-h-[85svh]">
                        <PCBPreview layers={processedLayers.length > 0 ? processedLayers : layers} viewMode={viewMode} />
                    </div>

                    <div className="absolute bottom-6 left-6 flex gap-4 animate-in slide-in-from-left-4 duration-500">
                        <div className="glass p-3 px-6 flex items-center gap-6">
                            <div>
                                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest leading-none mb-1">Board Area</p>
                                <p className="text-sm font-mono font-bold leading-none">{boardBounds.width.toFixed(1)} x {boardBounds.height.toFixed(1)} mm</p>
                            </div>
                            <div className="w-[1px] h-6 bg-brand-border" />
                            <div>
                                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest leading-none mb-1">Active Vectors</p>
                                <p className="text-sm font-mono font-bold leading-none">{layers.filter(l => l.visible).length}</p>
                            </div>
                            <div className="w-[1px] h-6 bg-brand-border" />
                            <div>
                                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest leading-none mb-1">Engine</p>
                                <p className="text-[11px] font-mono font-bold leading-none text-brand-accent">v{VERSION}</p>
                            </div>
                        </div>
                    </div>

                    <div className="absolute top-20 right-6 z-50 p-4 bg-black/80 backdrop-blur text-[10px] font-mono rounded-lg border border-red-900/50 shadow-2xl max-w-xs pointer-events-none">
                        <h3 className="text-red-400 font-bold mb-2">DEBUG OVERLAY</h3>
                        <div className="space-y-1 text-white/70">
                            <p>Layers: {debugData.layerCount}</p>
                            <p>Processed: {debugData.processedCount}</p>
                            <p>Processing: {debugData.isProcessing ? 'YES' : 'NO'}</p>
                            <p className="truncate">Bounds: {JSON.stringify(debugData.bounds)}</p>
                            <div className="mt-2 pt-2 border-t border-white/10">
                                <p className="mb-1 text-xs text-white">Debug Info:</p>
                                <p>Sel: {debugData.selectedId ? debugData.selectedId.substring(0, 8) : 'None'}</p>
                                <p>Inv (State): {String(debugData.selectedInverted)}</p>
                                <p>Inv (Proc): {String(debugData.processedInverted)}</p>
                            </div>
                        </div>
                    </div>
                </main>

                <aside className="w-80 border-l border-brand-border flex flex-col bg-brand-bg/80 backdrop-blur-xl">
                    <div className="p-6 space-y-8 overflow-y-auto">
                        {selectedLayer ? (
                            <div className="space-y-6 animate-in fade-in duration-300">
                                <div className="space-y-4">
                                    <div className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider leading-none">Mapping</div>
                                    <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-brand-border">
                                        {(['front', 'back', 'internal'] as const).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => updateLayer(selectedLayer.id, { side: s })}
                                                className={`flex-1 py-1.5 text-[9px] font-black rounded-lg transition-all ${selectedLayer.side === s ? 'bg-brand-accent text-white shadow-md' : 'text-brand-text-muted hover:text-white'}`}
                                            >
                                                {s.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-brand-text-muted uppercase tracking-tight">Laser Power</span>
                                        <span className="text-brand-accent font-mono bg-brand-accent/10 px-2 py-0.5 rounded">{selectedLayer.power}%</span>
                                    </div>
                                    <input type="range" min="0" max="100" step="1" value={selectedLayer.power} onChange={(e) => updateLayer(selectedLayer.id, { power: parseInt(e.target.value) })} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent" />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-brand-text-muted uppercase tracking-tight">Speed (mm/s)</span>
                                        <span className="text-brand-accent font-mono bg-brand-accent/10 px-2 py-0.5 rounded">{selectedLayer.speed}</span>
                                    </div>
                                    <input type="range" min="10" max="3000" step="10" value={selectedLayer.speed} onChange={(e) => updateLayer(selectedLayer.id, { speed: parseInt(e.target.value) })} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent" />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-brand-text-muted uppercase tracking-tight">Frequency (kHz)</span>
                                        <span className="text-brand-accent font-mono bg-brand-accent/10 px-2 py-0.5 rounded">{selectedLayer.frequency}</span>
                                    </div>
                                    <input type="range" min="40" max="80" step="1" value={selectedLayer.frequency} onChange={(e) => updateLayer(selectedLayer.id, { frequency: parseInt(e.target.value) })} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent" />
                                </div>

                                <div className="pt-4 space-y-3 border-t border-brand-border">
                                    <button onClick={() => updateLayer(selectedLayer.id, { inverted: !selectedLayer.inverted })} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedLayer.inverted ? 'bg-brand-accent/10 border-brand-accent text-brand-accent' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                                        <div className="flex items-center gap-3">
                                            <Zap size={14} />
                                            <span className="text-xs font-bold">Invert Paths</span>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full border-2 ${selectedLayer.inverted ? 'bg-brand-accent border-brand-accent' : 'border-white/20'}`} />
                                    </button>

                                    {selectedLayer.inverted && (
                                        <div className="space-y-4 pt-2 pl-2 border-l-2 border-brand-accent/20">
                                            <div className="flex justify-between items-center text-[10px] font-bold">
                                                <span className="text-brand-text-muted uppercase tracking-tight">Invert Padding (mm)</span>
                                                <span className="text-brand-accent font-mono bg-brand-accent/10 px-2 py-0.5 rounded">{selectedLayer.invertPadding ?? 2}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="20" step="0.5"
                                                value={selectedLayer.invertPadding ?? 2}
                                                onChange={(e) => updateLayer(selectedLayer.id, { invertPadding: parseFloat(e.target.value) })}
                                                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                                            />
                                        </div>
                                    )}

                                    <button onClick={() => updateLayer(selectedLayer.id, { mirrored: !selectedLayer.mirrored })} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedLayer.mirrored ? 'bg-brand-accent/10 border-brand-accent text-brand-accent' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                                        <div className="flex items-center gap-3">
                                            <FlipHorizontal size={14} />
                                            <span className="text-xs font-bold">Mirror Layer</span>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full border-2 ${selectedLayer.mirrored ? 'bg-brand-accent border-brand-accent' : 'border-white/20'}`} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[60vh] flex flex-col items-center justify-center text-center p-8 text-brand-text-muted space-y-4 opacity-30">
                                <Settings2 size={48} />
                                <p className="text-xs font-bold">Select a layer to inspect parameters</p>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default App;
