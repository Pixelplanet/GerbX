/**
 * XCS File Generator for xTool Creative Space
 */

export interface XCSLayer {
    name: string;
    paths: string[];
    visible: boolean;
    color: string; // Hex string e.g. "#ffffff"
    speed?: number;
    power?: number;
    frequency?: number;
    lpi?: number;
    passes?: number;
}

export class XCSGenerator {
    private settings: any;

    constructor(settings?: any) {
        this.settings = settings || {};
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    public generate(layers: XCSLayer[]): string {
        const canvasId = this.generateUUID();
        const timestamp = Date.now();
        const displays: any[] = [];
        const displaySettingsMap = new Map();

        layers.forEach((layer, index) => {
            if (!layer.visible || !layer.paths || layer.paths.length === 0) return;

            const combinedPath = layer.paths.join(' ');
            if (combinedPath.length === 0) return;

            const displayId = this.generateUUID();
            const display = this.createPathDisplay(displayId, index, layer.name, combinedPath, layer.color);

            if (display) {
                displays.push(display);
                displaySettingsMap.set(displayId, {
                    speed: layer.speed || 100,
                    power: layer.power || 10,
                    repeat: layer.passes || 1,
                    frequency: layer.frequency || 60,
                    lpi: layer.lpi || 300
                });
            }
        });

        const deviceId = this.settings.activeDevice || 'f2_ultra_uv';
        const isBase = deviceId === 'f2_ultra_base';

        const fileContent = {
            canvasId: canvasId,
            canvas: [{
                id: canvasId,
                title: "GerbX Project",
                layerData: this.generateLayerData(layers),
                groupData: {},
                displays: displays
            }],
            extId: isBase ? "GS009-CLASS-1" : "GS009-CLASS-4",
            extName: isBase ? "F2 Ultra (Base)" : "F2 Ultra UV",
            version: "1.3.6",
            created: timestamp,
            modify: timestamp,
            device: this.generateDeviceData(canvasId, displays, displaySettingsMap, isBase)
        };

        return JSON.stringify(fileContent);
    }

    private generateLayerData(layers: XCSLayer[]) {
        const data: any = {};
        layers.forEach((layer, index) => {
            data[layer.color] = {
                name: layer.name,
                order: index + 1,
                visible: true
            };
        });
        return data;
    }

    private generateDeviceData(canvasId: string, displays: any[], displaySettingsMap: Map<string, any>, isBase: boolean) {
        const displayEntries = displays.map(display => {
            const s = displaySettingsMap.get(display.id);
            const customize: any = {
                speed: s.speed,
                power: s.power,
                repeat: s.repeat,
                frequency: s.frequency,
                density: s.lpi,
                dpi: s.lpi,
                enableKerf: false,
                kerfDistance: 0,
                bitmapScanMode: 'lineMode',
                bitmapEngraveMode: "normal",
                scanAngle: 0
            };

            if (isBase) {
                customize.processingLightSource = "red";
            }

            return [
                display.id,
                {
                    isFill: true,
                    type: "PATH",
                    processingType: "FILL_VECTOR_ENGRAVING",
                    data: {
                        FILL_VECTOR_ENGRAVING: {
                            materialType: "customize",
                            planType: "dot_cloud",
                            parameter: { customize: customize }
                        }
                    },
                    processIgnore: false
                }
            ];
        });

        const lightSource = isBase ? "red" : "uv";

        const canvasEntry = [
            canvasId,
            {
                mode: "LASER_PLANE",
                data: {
                    LASER_PLANE: {
                        lightSourceMode: lightSource,
                        isProcessByLayer: false,
                        pathPlanning: "auto",
                        fillPlanning: "separate"
                    }
                },
                displays: {
                    dataType: "Map",
                    value: displayEntries
                }
            }
        ];

        return {
            id: isBase ? "GS009-CLASS-1" : "GS009-CLASS-4",
            data: {
                dataType: "Map",
                value: [canvasEntry]
            }
        };
    }

    private createPathDisplay(id: string, index: number, name: string, dPath: string, color: string) {
        const tightened = this.calculateBoundsAndTighten(dPath);
        if (!tightened.bounds) return null;

        const colorInt = parseInt(color.replace('#', ''), 16);

        return {
            id: id,
            name: name,
            type: "PATH",
            x: tightened.bounds.x,
            y: tightened.bounds.y,
            width: tightened.bounds.width,
            height: tightened.bounds.height,
            zOrder: index + 1,
            layerColor: color,
            visible: true,
            isFill: true,
            fillColor: color,
            dPath: tightened.dPath
        };
    }

    private calculateBoundsAndTighten(dPath: string) {
        const tokens = dPath.match(/[a-df-z]+|[-+]?\d*\.?\d+/gi);
        if (!tokens) return { dPath, bounds: null };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let isX = true;

        for (const token of tokens) {
            if (/[a-z]/i.test(token)) continue;
            const val = parseFloat(token);
            if (!isNaN(val)) {
                if (isX) {
                    minX = Math.min(minX, val);
                    maxX = Math.max(maxX, val);
                } else {
                    minY = Math.min(minY, val);
                    maxY = Math.max(maxY, val);
                }
                isX = !isX;
            }
        }

        if (minX === Infinity) return { dPath, bounds: null };

        let shiftedPath = "";
        isX = true;
        let lastWasCommand = false;

        for (const token of tokens) {
            if (/[a-z]/i.test(token)) {
                shiftedPath += (shiftedPath.length > 0 ? " " : "") + token;
                lastWasCommand = true;
                continue;
            }
            const val = parseFloat(token);
            if (!isNaN(val)) {
                const shifted = isX ? (val - minX) : (val - minY);
                shiftedPath += (lastWasCommand ? "" : " ") + shifted.toFixed(3);
                isX = !isX;
                lastWasCommand = false;
            }
        }

        return {
            dPath: shiftedPath.trim(),
            bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        };
    }
}
