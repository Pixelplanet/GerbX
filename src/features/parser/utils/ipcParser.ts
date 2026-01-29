import { PCBLayer } from '~types/pcb';

export const parseIPC2581 = async (file: File): Promise<PCBLayer[]> => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    const layers: PCBLayer[] = [];
    const layerRefs = xmlDoc.getElementsByTagName('LayerRef');

    for (let i = 0; i < layerRefs.length; i++) {
        const layerName = layerRefs[i].getAttribute('name');
        if (!layerName) continue;

        // In a real IPC-2581 parser, we would extract the Step and Features
        // for now we'll create the layer structure
        layers.push({
            id: crypto.randomUUID(),
            name: layerName,
            type: detectTypeFromName(layerName),
            side: detectSideFromName(layerName),
            content: '', // In reality, we'd find the corresponding Step data
            visible: true,
            color: '#00ff00',
            mirrored: false,
            inverted: layerName.includes('Cu'),
            speed: 100,
            power: 20,
            frequency: 40,
            invertPadding: 2,
        });
    }

    return layers;
};

const detectTypeFromName = (name: string): string => {
    if (name.includes('Cu')) return 'Copper';
    if (name.includes('Silk')) return 'Silkscreen';
    if (name.includes('Mask')) return 'Solder Mask';
    return 'Other';
};

const detectSideFromName = (name: string): 'front' | 'back' | 'internal' | 'board' => {
    const lower = name.toLowerCase();
    if (lower.startsWith('f.') || lower.includes('top')) return 'front';
    if (lower.startsWith('b.') || lower.includes('bottom')) return 'back';
    if (lower.includes('edge') || lower.includes('cut') || lower.includes('gm')) return 'board';
    return 'internal';
};
