import { useState, useCallback, useEffect } from 'react';
import { Upload, Download, RefreshCw, ZoomIn, ZoomOut, Maximize, Loader2, FileStack } from 'lucide-react';
import { PCBLayer } from '~types/pcb';
import { parseGerberFiles } from '@/features/parser/utils/gerberParser';
import { GerberViewer } from '@/features/viewer/GerberViewer';
import { LayerManager } from '@/features/layers/LayerManager';
import { GerbXLayout } from '@/layouts/GerbXLayout';
import { useExport } from '@/features/parser/hooks/useExport';
import { useDropzone } from 'react-dropzone';

function App() {
    const [layers, setLayers] = useState<PCBLayer[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const { downloadSvg, downloadXcs } = useExport();

    // -- File Handling --
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        setIsParsing(true);
        try {
            // Note: We currently only support multi-file drop logic here.
            // If specific ZIP handling is needed, we should check type.
            // For now, using the robust parseGerberFiles which handles individual files.
            // If a ZIP is dropped, parseGerberFiles logic might need to handle it or we use parseGerberZip.
            // Let's keep it simple: parseGerberFiles iterates files. 
            // If user drops a ZIP, acceptedFiles is [zip].
            // We need to verify if parseGerberFiles supports ZIP or if we need to split.
            // Looking at previous implementation, parseGerberFiles iterates file list.
            // We probably should check for ZIP here to use parseGerberZip if we want to support it still.

            // Re-implement ZIP check for backward compatibility
            const isZip = acceptedFiles.length === 1 && (acceptedFiles[0].name.endsWith('.zip') || acceptedFiles[0].type === 'application/zip');

            let newLayers: PCBLayer[] = [];

            if (isZip) {
                const { parseGerberZip } = await import('@/features/parser/utils/gerberParser');
                newLayers = await parseGerberZip(acceptedFiles[0]);
            } else {
                newLayers = await parseGerberFiles(acceptedFiles);
            }

            // Merge with existing or Replace? 
            // Usually easier to replace for clean slate, or append?
            // Let's append to allow adding more files.
            setLayers(prev => [...prev, ...newLayers]);

            if (newLayers.length > 0 && !activeLayerId) {
                setActiveLayerId(newLayers[0].id);
            }

        } catch (err) {
            console.error("Upload failed", err);
            // Show error notification (future)
        } finally {
            setIsParsing(false);
        }
    }, [activeLayerId]);

    const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
        onDrop,
        noClick: true, // We trigger manually via button
        noKeyboard: true,
        multiple: true,
        accept: {
            'application/zip': ['.zip'],
            'application/x-gerber': ['.gbr', '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gko', '.drl', '.xln']
        }
    });

    // -- Layer Actions --
    const toggleLayer = (id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
    };

    const updateLayerColor = (id: string, color: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l));
    };

    const deleteLayer = (id: string) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (activeLayerId === id) setActiveLayerId(null);
    };

    const handleReset = () => {
        setLayers([]);
        setActiveLayerId(null);
    };

    // -- Header Content --
    const HeaderActions = () => (
        <div className="flex items-center gap-2">
            <button
                onClick={openFileDialog}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors"
            >
                {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload Files
            </button>

            <div className="h-4 w-px bg-zinc-700 mx-1" />

            <button
                onClick={() => downloadSvg(layers)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm transition-colors border border-zinc-700"
                disabled={layers.length === 0}
            >
                <FileStack className="w-4 h-4 text-orange-400" />
                SVG
            </button>
            <button
                onClick={() => downloadXcs(layers)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-sm transition-colors border border-zinc-700"
                disabled={layers.length === 0}
            >
                <Download className="w-4 h-4 text-green-400" />
                XCS
            </button>

            <button
                onClick={handleReset}
                className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                title="Clear All"
            >
                <RefreshCw className="w-4 h-4" />
            </button>
        </div>
    );

    return (
        <div {...getRootProps()} className="h-full">
            <input {...getInputProps()} />

            <GerbXLayout header={<HeaderActions />} sidebar={
                <LayerManager
                    layers={layers}
                    onToggleVisibility={toggleLayer}
                    onColorChange={updateLayerColor}
                    onDeleteLayer={deleteLayer}
                />
            }>
                {/* Main Content */}
                {layers.length > 0 ? (
                    <GerberViewer layers={layers} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                        <UploadCloud className={`w-16 h-16 ${isDragActive ? 'text-indigo-500 animate-bounce' : 'text-zinc-700'}`} />
                        <div className="text-center">
                            <p className="text-lg font-medium text-zinc-300">
                                {isDragActive ? "Drop files now" : "Drag & Drop Gerber files"}
                            </p>
                            <p className="text-sm mt-1">or click "Upload Files" to browse</p>
                        </div>
                    </div>
                )}

                {/* Global Loading Overlay */}
                {isParsing && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-zinc-900 p-6 rounded-lg shadow-xl border border-zinc-700 flex flex-col items-center gap-4">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                            <p className="text-zinc-200 font-medium">Processing Gerber Files...</p>
                        </div>
                    </div>
                )}

            </GerbXLayout>
        </div>
    );
}

// Re-using the icon for the empty state
import { UploadCloud } from 'lucide-react';

export default App;
