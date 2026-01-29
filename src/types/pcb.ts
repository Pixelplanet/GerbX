export type PCBFileSource = 'ZIP' | 'IPC2581' | 'SVG';

export interface PCBLayer {
    id: string;
    name: string;
    type: string; // e.g., 'F_Cu', 'B_Cu', 'F_Silk', etc.
    side: 'front' | 'back' | 'internal' | 'board';
    content: string; // The raw content or processed path
    visible: boolean;
    color: string;
    mirrored: boolean;
    inverted: boolean; // For copper removal
    speed: number;
    power: number;
    frequency: number;
    sourceFormat?: 'gerber' | 'svg';
    bounds?: { x: number; y: number; width: number; height: number };
    invertPadding: number;
    outline?: string; // Simplified path for masking/bounds
    simplifiedContent?: string; // Low-fidelity merged polygons for boolean operations
}

export interface PCBProject {
    id: string;
    name: string;
    sourceType: PCBFileSource;
    layers: PCBLayer[];
    width: number;
    height: number;
}
