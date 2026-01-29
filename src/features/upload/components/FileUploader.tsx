import React, { useState, useCallback } from 'react';
import { Upload, FileType, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploaderProps {
    onFilesAccepted: (file: File) => void;
    isProcessing?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAccepted, isProcessing }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const validateFile = (file: File) => {
        const isZip = file.type === 'application/zip' || file.name.endsWith('.zip');
        const isXml = file.type === 'text/xml' || file.name.endsWith('.xml');
        const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg');

        if (isZip || isXml || isSvg) {
            setError(null);
            return true;
        }

        setError('Invalid file format. Please use Gerber ZIP, SVG, or IPC-2581 XML.');
        return false;
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (validateFile(file)) {
                onFilesAccepted(file);
            }
        }
    }, [onFilesAccepted]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (validateFile(file)) {
                onFilesAccepted(file);
            }
        }
    };

    return (
        <div className="w-full">
            <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          relative flex flex-col items-center justify-center w-full h-80 
          border-2 border-dashed rounded-[2rem] cursor-pointer transition-all duration-500 group
          ${isDragging
                        ? 'border-brand-accent bg-brand-accent/10 scale-[1.01] shadow-2xl shadow-brand-accent-glow'
                        : 'border-brand-border bg-white/5 hover:bg-white/10 hover:border-brand-text-muted'}
        `}
            >
                <div className="flex flex-col items-center justify-center space-y-4 px-12 text-center">
                    <div className={`p-6 rounded-3xl transition-all duration-500 scale-100 ${isDragging ? 'bg-brand-accent text-white rotate-6' : 'bg-black/40 text-brand-text-muted group-hover:scale-110 group-hover:-rotate-3'}`}>
                        <Upload size={48} strokeWidth={1.5} />
                    </div>

                    <div className="space-y-2">
                        <p className="text-2xl font-black tracking-tight text-white">
                            {isProcessing ? 'SYNTHESIZING DESIGN...' : 'INGEST PCB DATA'}
                        </p>
                        <p className="text-sm font-medium text-brand-text-muted">
                            {isProcessing ? 'Decompressing and mapping layers to fabrication primitives' : 'Drag Gerber ZIP, SVG Export, or IPC-2581 XML to initiate stack parsing'}
                        </p>
                    </div>

                    {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand-bg/60 backdrop-blur-sm rounded-[2rem] z-10">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 border-4 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
                                <span className="text-[10px] font-black tracking-[0.3em] text-brand-accent">PROCESSING</span>
                            </div>
                        </div>
                    )}
                </div>

                <input
                    type="file"
                    className="hidden"
                    accept=".zip,.xml,.svg"
                    onChange={handleFileInput}
                    disabled={isProcessing}
                />

                {error && (
                    <div className="absolute -bottom-16 flex items-center gap-3 px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 animate-in fade-in slide-in-from-top-4">
                        <AlertCircle size={18} />
                        <span className="text-sm font-bold">{error}</span>
                    </div>
                )}
            </label>

            <div className="mt-16 grid grid-cols-2 gap-6">
                <div className="flex items-start gap-4 p-6 glass hover:border-brand-accent/50 transition-all pointer-events-none opacity-60">
                    <div className="p-3 bg-brand-accent/10 rounded-xl text-brand-accent">
                        <FileType size={24} />
                    </div>
                    <div className="text-left space-y-1">
                        <h3 className="text-sm font-bold text-white">Standard Gerbers</h3>
                        <p className="text-xs text-brand-text-muted leading-relaxed">ZIP archive containing standard .gbr, .gtl, .gts, and .drl drill files.</p>
                    </div>
                </div>
                <div className="flex items-start gap-4 p-6 glass hover:border-green-500/50 transition-all pointer-events-none opacity-60">
                    <div className="p-3 bg-green-500/10 rounded-xl text-green-500">
                        <CheckCircle size={24} />
                    </div>
                    <div className="text-left space-y-1">
                        <h3 className="text-sm font-bold text-white">Unified XML</h3>
                        <p className="text-xs text-brand-text-muted leading-relaxed">IPC-2581 implementation for single-file, semantic stackup transfer.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
