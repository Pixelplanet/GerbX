import React, { ReactNode } from 'react';
import { LayoutDashboard, Layers, UploadCloud } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface GerbXLayoutProps {
    children?: ReactNode;
    header?: ReactNode;
    sidebar?: ReactNode;
    sidebarOpen?: boolean;
}

export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export const GerbXLayout: React.FC<GerbXLayoutProps> = ({
    children,
    header,
    sidebar,
    sidebarOpen = true
}) => {
    return (
        <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
            {/* Header Area */}
            <header className="h-14 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur flex items-center px-4 justify-between shrink-0 z-10">
                <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
                    <LayoutDashboard className="w-5 h-5 text-indigo-500" />
                    <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                        GerbX Viewer
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {header}
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Sidebar */}
                <aside
                    className={cn(
                        "w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300 ease-in-out absolute md:relative z-20 h-full",
                        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-none overflow-hidden"
                        // Adjusted: checking allow toggle behavior later. For now fixed width or hidden.
                    )}
                >
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                        <h2 className="font-semibold text-sm text-zinc-400 flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Layers
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700">
                        {sidebar}
                    </div>
                </aside>

                {/* Canvas Area */}
                <main className="flex-1 bg-zinc-950 relative overflow-hidden flex flex-col">
                    {children}

                    {/* Overlay Controls (Zoom/Pan hints if needed) */}
                    <div className="absolute bottom-4 right-4 pointer-events-none">
                        {/* Placeholder for floating controls */}
                    </div>
                </main>
            </div>
        </div>
    );
};
