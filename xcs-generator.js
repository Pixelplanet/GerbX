/**
 * XCS File Generator
 * Generates .xcs files for xTool Creative Space
 */

export class XCSGenerator {
    constructor(settings) {
        this.settings = settings || {};
        this.pxPerMm = 10; // 10 pixels per mm (constant)
    }

    /**
     * Generate UUID v4
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Generate XCS file content from vectorized layers
     * @param {ImageData} imageData - Original or processed image data
     * @param {Array} layers - Vectorized layers
     * @param {Object} size - Output size { width, height } in mm
     * @returns {string} - JSON string of the .xcs file
     */
    generate(imageData, layers, size) {
        const canvasId = this.generateUUID();
        const timestamp = Date.now();

        // Displays collection
        const displays = [];

        // Map to store settings for each display ID
        const displaySettingsMap = new Map();

        layers.forEach((layer, layerIndex) => {
            if (!layer.visible) return;

            // Filter valid paths and join them
            if (layer.paths && layer.paths.length > 0) {
                const combinedPath = layer.paths.filter(p => p && p.length > 0).join(' ');

                if (combinedPath.length > 0) {
                    const displayId = this.generateUUID();
                    // Create path display with auto-tightening
                    const display = this.createPathDisplayWithPath(
                        displayId,
                        layerIndex,
                        layer.name || `Layer ${layerIndex + 1}`,
                        combinedPath,
                        layer.color
                    );

                    if (display) {
                        displays.push(display);

                        // Capture settings for this layer
                        // Priority: Layer specific -> Global settings -> Default
                        displaySettingsMap.set(displayId, {
                            speed: layer.speed !== undefined ? layer.speed : (parseInt(this.settings.speed) || 100),
                            power: layer.power !== undefined ? layer.power : (parseInt(this.settings.power) || 10),
                            repeat: layer.passes !== undefined ? layer.passes : (parseInt(this.settings.passes) || 1),
                            frequency: layer.frequency !== undefined ? layer.frequency : 60,
                            lpi: layer.lpi !== undefined ? layer.lpi : 300,
                            crossHatch: layer.crossHatch !== undefined ? layer.crossHatch : (this.settings.crossHatch || false),
                            // Base Support
                            pulseWidth: layer.pulseWidth !== undefined ? layer.pulseWidth : (parseInt(this.settings.pulseWidth) || 80)
                        });
                    }
                }
            }
        });

        // Top-level Structure matching Documentation
        const deviceId = this.settings.activeDevice || 'f2_ultra_uv';
        const isBase = deviceId === 'f2_ultra_base';

        // Device Identifiers
        // "GS009-CLASS-4" is definitely the UV module
        // "GS009-CLASS-1" is a guess for the Base/Blue module, or we use a safe fallback
        const extId = isBase ? "GS009-CLASS-1" : "GS009-CLASS-4";
        const extName = isBase ? "F2 Ultra (Base)" : "F2 Ultra UV";

        const fileContent = {
            "canvasId": canvasId,
            "canvas": [{
                "id": canvasId,
                "title": "Engraved Image",
                "layerData": this.generateLayerData(layers),
                "groupData": {},
                "displays": displays
            }],
            "extId": extId,
            "extName": extName,
            "version": "1.3.6",
            "created": timestamp,
            "modify": timestamp,
            "device": this.generateDeviceData(canvasId, displays, displaySettingsMap, isBase)
        };

        // Return minified JSON as per spec
        return JSON.stringify(fileContent);
    }

    generateLayerData(layers) {
        const data = {};
        layers.forEach((layer, index) => {
            const colorHex = this.rgbToHex(layer.color);
            data[colorHex] = {
                "name": layer.name || `Layer ${index + 1}`,
                "order": index + 1,
                "visible": true
            };
        });
        return data;
    }

    generateDeviceData(canvasId, displays, displaySettingsMap, isBase) {
        // Build map of display settings
        const displayEntries = displays.map(display => {
            // Get settings for this specific display
            const s = displaySettingsMap.get(display.id) || {
                speed: 100, power: 10, repeat: 1, frequency: 60, lpi: 300, crossHatch: false, pulseWidth: 80
            };

            const customize = {
                "speed": parseInt(s.speed),
                "power": parseInt(s.power),
                "repeat": parseInt(s.repeat),
                "frequency": parseInt(s.frequency),
                "density": parseInt(s.lpi),
                "dpi": parseInt(s.lpi),
                "enableKerf": false,
                "kerfDistance": 0,
                "bitmapScanMode": s.crossHatch ? 'crossMode' : 'lineMode',
                "crossAngle": s.crossHatch,
                "bitmapEngraveMode": "normal",
                "scanAngle": 0
            };

            // Inject Base-specific parameters if active
            if (isBase) {
                customize.pulseWidth = parseInt(s.pulseWidth) || 80;
                customize.mopaFrequency = parseInt(s.frequency); // Map standard freq to mopaFreq
                customize.processingLightSource = "red";
            }

            return [
                display.id,
                {
                    "isFill": true,
                    "type": "PATH",
                    "processingType": "FILL_VECTOR_ENGRAVING",
                    "data": {
                        "FILL_VECTOR_ENGRAVING": {
                            "materialType": "customize",
                            "planType": "dot_cloud",
                            "parameter": {
                                "customize": customize
                            }
                        }
                    },
                    "processIgnore": false
                }
            ];
        });

        // Build canvas settings map
        // Base implies Fiber/MOPA (Red/Infrared) for F2 Ultra Base
        // UV is 'uv'
        const lightSource = isBase ? "red" : "uv";

        const canvasEntry = [
            canvasId,
            {
                "mode": "LASER_PLANE",
                "data": {
                    "LASER_PLANE": {
                        "material": 0,
                        "lightSourceMode": lightSource,
                        "thickness": 0,
                        "isProcessByLayer": false,
                        "pathPlanning": "auto",
                        "fillPlanning": "separate",
                        "dreedyTsp": false,
                        "avoidSmokeModal": false,
                        "scanDirection": "topToBottom",
                        "enableOddEvenKerf": true,
                        "xcsUsed": []
                    }
                },
                "displays": {
                    "dataType": "Map",
                    "value": displayEntries
                }
            }
        ];

        return {
            "id": isBase ? "GS009-CLASS-1" : "GS009-CLASS-4",
            "power": [20],
            "data": {
                "dataType": "Map",
                "value": [canvasEntry]
            },
            "materialList": [],
            "materialTypeList": [],
            "customProjectData": {
                "tangentialCuttingUuids": [],
                "flyCutUuid2CanvasIds": {}
            }
        };
    }

    /**
     * Create a PATH display element
     */
    createPathDisplayWithPath(id, index, name, dPath, color) {
        // Tighten bounds
        const tightened = this.calculateBoundsAndTighten(dPath);

        let x = tightened.bounds ? tightened.bounds.x : 0;
        let y = tightened.bounds ? tightened.bounds.y : 0;
        let width = tightened.bounds ? tightened.bounds.width : 50;
        let height = tightened.bounds ? tightened.bounds.height : 50;

        // Safety checks
        if (!isFinite(x)) x = 0;
        if (!isFinite(y)) y = 0;
        if (!isFinite(width) || width < 0.001) width = 0.001;
        if (!isFinite(height) || height < 0.001) height = 0.001;

        const finalPath = tightened.dPath || "";
        if (finalPath.length === 0) return null;

        const colorHex = this.rgbToHex(color);
        const colorInt = parseInt(colorHex.substring(1), 16);

        return {
            "id": id,
            "name": name,
            "type": "PATH",
            "x": x,
            "y": y,
            "angle": 0,
            "scale": { "x": 1, "y": 1 },
            "skew": { "x": 0, "y": 0 },
            "pivot": { "x": 0, "y": 0 },
            "localSkew": { "x": 0, "y": 0 },
            "offsetX": x,
            "offsetY": y,
            "lockRatio": true,
            "isClosePath": true,
            "zOrder": index + 1,
            "sourceId": "",
            "groupTag": "",
            "layerTag": colorHex,
            "layerColor": colorHex,
            "visible": true,
            "originColor": colorHex,
            "enableTransform": true,
            "visibleState": true,
            "lockState": false,
            "resourceOrigin": "",
            "customData": {},
            "rootComponentId": "",
            "minCanvasVersion": "0.0.0",
            "fill": {
                "paintType": "color",
                "visible": true,
                "color": colorInt,
                "alpha": 1
            },
            "stroke": {
                "paintType": "color",
                "visible": false,
                "color": colorInt,
                "alpha": 1,
                "width": 0.05,
                "cap": "round",
                "join": "round",
                "miterLimit": 4,
                "alignment": 0.5
            },
            "width": width,
            "height": height,
            "isFill": true,
            "lineColor": colorInt,
            "fillColor": colorHex,
            "graphicX": x,
            "graphicY": y,
            "isCompoundPath": true,
            "fillRule": "nonzero",
            "points": [],
            "dPath": finalPath
        };
    }

    calculateBoundsAndTighten(dPath) {
        const tokens = dPath.match(/[a-df-z]+|[-+]?\d*\.?\d+/gi);
        if (!tokens) return { dPath, bounds: null };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let isX = true; // Track coordinate type (x or y)

        // Pass 1: Bounds
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (/[a-z]/i.test(token)) {
                continue;
            }
            const val = parseFloat(token);
            if (!isNaN(val)) {
                if (isX) {
                    if (val < minX) minX = val;
                    if (val > maxX) maxX = val;
                } else {
                    if (val < minY) minY = val;
                    if (val > maxY) maxY = val;
                }
                isX = !isX;
            }
        }

        if (minX === Infinity) return { dPath, bounds: null };

        // Pass 2: Shift and Compact Format (No extra spaces)
        let shiftedPath = "";
        isX = true; // Reset tracker
        let lastWasCommand = false;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (/[a-z]/i.test(token)) {
                // Command
                shiftedPath += (shiftedPath.length > 0 ? " " : "") + token;
                lastWasCommand = true;
                continue;
            }
            const val = parseFloat(token);
            if (!isNaN(val)) {
                const shifted = isX ? (val - minX) : (val - minY);

                // If previous was command, NO SPACE (M0.000). 
                // If previous was number, SPACE (0.000 0.000).
                const prefix = lastWasCommand ? "" : " ";
                shiftedPath += prefix + shifted.toFixed(3);

                isX = !isX;
                lastWasCommand = false;
            } else {
                shiftedPath += token;
            }
        }

        return {
            dPath: shiftedPath.trim(),
            bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        };
    }

    rgbToHex(color) {
        const toHex = (c) => {
            const hex = Math.round(c).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        };
        return "#" + toHex(color.r) + toHex(color.g) + toHex(color.b);
    }
}
