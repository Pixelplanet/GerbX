# XCS File Format Documentation

## Overview

The `.xcs` file format is used by **xTool Creative Space/xTool Studio** for storing laser engraving and cutting projects. It is a JSON-based format that contains canvas definitions, layer information, graphical elements, and device processing parameters.

## File Characteristics

- **Format**: JSON (single line, no formatting/whitespace)
- **Extension**: `.xcs`
- **Encoding**: UTF-8
- **Size**: Can be very large (multi-megabyte) due to embedded font glyph data and processing parameters

---

## Top-Level Structure

```json
{
  "canvasId": "UUID",
  "canvas": [...],
  "extId": "device-id",
  "extName": "Device Name",
  "version": "1.3.6",
  "created": 1737471771000,
  "modify": 1737471771000,
  "device": {...}
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `canvasId` | `string` (UUID) | Yes | Unique identifier for the active/main canvas |
| `canvas` | `array<Canvas>` | Yes | Array of canvas/workpiece definitions |
| `extId` | `string` | Yes | Device identifier (e.g., "GS009-CLASS-4") |
| `extName` | `string` | Yes | Device display name (e.g., "F2 Ultra UV") |
| `version` | `string` | Yes | xTool Studio version (semver format) |
| `created` | `number` | Yes | Creation timestamp (Unix ms) |
| `modify` | `number` | Yes | Last modification timestamp (Unix ms) |
| `device` | `object<Device>` | Yes | Device configuration and processing parameters |

### Known Device IDs

| extId | extName |
|-------|---------|
| `GS009-CLASS-4` | F2 Ultra UV |

---

## Canvas Object

Each canvas represents a workpiece or panel.

```json
{
  "id": "UUID",
  "title": "Panel 1",
  "layerData": {},
  "groupData": {},
  "displays": []
}
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` (UUID) | Canvas identifier (should match `canvasId` for main canvas) |
| `title` | `string` | Display title (supports localization with `{panel}` prefix) |
| `layerData` | `object<string, Layer>` | Color-keyed layer definitions |
| `groupData` | `object` | Group hierarchy definitions |
| `displays` | `array<Display>` | Array of display/element objects |

---

## Layer Data

Layers are keyed by their color hex code.

```json
"layerData": {
  "#ff0000": { "name": "Red Layer", "order": 1, "visible": true },
  "#0000ff": { "name": "Blue Layer", "order": 2, "visible": true }
}
```

### Layer Object

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Layer name (supports localization with `{Color}` format) |
| `order` | `number` | Processing order (1 = first) |
| `visible` | `boolean` | Layer visibility flag |

---

## Coordinate System

**IMPORTANT**: The XCS coordinate system uses the following rules:

1. **Origin**: Top-left corner of the canvas
2. **Units**: Millimeters (mm)
3. **Y-axis**: Positive downward
4. **Position fields must be equal**: `x = offsetX = graphicX` and `y = offsetY = graphicY`
5. **Path origin**: `dPath` always starts from `M0 0` (the path is drawn relative to its position)
6. **Position meaning**: The position values represent the **top-left corner** of the element's bounding box

### Positioning Example

For a 40×30mm rectangle with center at (50, 50):
- Top-left corner: `(50 - 40/2, 50 - 30/2)` = `(30, 35)`
- Set: `x = offsetX = graphicX = 30`
- Set: `y = offsetY = graphicY = 35`
- dPath: `M0 0 L40 0 L40 30 L0 30 Z`

---

## Display Object (Elements)

Display objects represent all graphical elements on the canvas.

### Common Properties (All Types)

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` (UUID) | Element unique identifier |
| `name` | `string\|null` | Optional element name |
| `type` | `string` | Element type: `"TEXT"`, `"PATH"`, `"IMAGE"`, etc. |
| `x` | `number` | X position (top-left, in mm) - **must equal offsetX and graphicX** |
| `y` | `number` | Y position (top-left, in mm) - **must equal offsetY and graphicY** |
| `angle` | `number` | Rotation angle in degrees |
| `scale` | `{x: number, y: number}` | Scale factors |
| `skew` | `{x: number, y: number}` | Skew transformation |
| `pivot` | `{x: number, y: number}` | Transformation pivot point |
| `localSkew` | `{x: number, y: number}` | Local skew values |
| `offsetX` | `number` | X offset - **must equal x and graphicX** |
| `offsetY` | `number` | Y offset - **must equal y and graphicY** |
| `lockRatio` | `boolean` | Aspect ratio lock |
| `isClosePath` | `boolean` | Whether path is closed |
| `zOrder` | `number` | Z-index for stacking (higher = on top) |
| `sourceId` | `string` | Reference to source element (empty string if none) |
| `groupTag` | `string` (UUID) | Parent group identifier (empty string if none) |
| `layerTag` | `string` | Layer color reference (e.g., `"#ff0000"`) |
| `layerColor` | `string` | Display color hex |
| `visible` | `boolean` | Element visibility |
| `originColor` | `string` | Original/source color |
| `enableTransform` | `boolean` | Allow transformations |
| `visibleState` | `boolean` | Visibility state |
| `lockState` | `boolean` | Lock state (prevent editing) |
| `resourceOrigin` | `string` | Resource file path (empty string if none) |
| `customData` | `object` | Element-specific custom data |
| `rootComponentId` | `string` | Root component reference (empty string if none) |
| `minCanvasVersion` | `string` | Minimum compatible version (semver, use "0.0.0") |
| `width` | `number` | Element width in mm |
| `height` | `number` | Element height in mm |

### Fill Object

```json
"fill": {
  "paintType": "color",
  "visible": false,
  "color": 16711680,
  "alpha": 1
}
```

| Property | Type | Description |
|----------|------|-------------|
| `paintType` | `string` | Paint type: `"color"` |
| `visible` | `boolean` | Fill visibility |
| `color` | `number` | Color as integer (decimal RGB) |
| `alpha` | `number` | Alpha/opacity (0-1) |

### Stroke Object

```json
"stroke": {
  "paintType": "color",
  "visible": true,
  "color": 16711680,
  "alpha": 1,
  "width": 0.5,
  "cap": "butt",
  "join": "miter",
  "miterLimit": 4,
  "alignment": 0.5
}
```

| Property | Type | Description |
|----------|------|-------------|
| `paintType` | `string` | Paint type: `"color"` |
| `visible` | `boolean` | Stroke visibility |
| `color` | `number` | Color as integer |
| `alpha` | `number` | Alpha/opacity (0-1) |
| `width` | `number` | Stroke width in mm |
| `cap` | `string` | Line cap: `"butt"`, `"round"`, `"square"` |
| `join` | `string` | Line join: `"miter"`, `"round"`, `"bevel"` |
| `miterLimit` | `number` | Miter limit |
| `alignment` | `number` | Stroke alignment (0.5 = centered) |

---

## Element Types

### Type: PATH

Path elements contain SVG-style vector paths.

#### Additional Properties

| Property | Type | Description |
|----------|------|-------------|
| `points` | `array` | Control points array (usually empty, use dPath) |
| `dPath` | `string` | SVG path data - **must start from M0 0** |
| `fillRule` | `string` | Fill rule: `"nonzero"`, `"evenodd"` |
| `graphicX` | `number` | Graphic origin X - **must equal x and offsetX** |
| `graphicY` | `number` | Graphic origin Y - **must equal y and offsetY** |
| `isCompoundPath` | `boolean` | Is compound path |
| `isFill` | `boolean` | Use fill mode for processing |
| `lineColor` | `number` | Line color as integer |
| `fillColor` | `string` | Fill color as hex string |

#### Path Data (dPath) Format

Standard SVG path commands, always starting from origin (0, 0):
- `M x y` - Move to (first command should be `M0 0` or `M 0 0`)
- `L x y` - Line to
- `C x1 y1 x2 y2 x y` - Cubic bezier
- `Q x1 y1 x y` - Quadratic bezier
- `Z` - Close path

**Rectangle Example** (40×30mm):
```
M0 0 L40 0 L40 30 L0 30 Z
```

### Type: TEXT

Text elements contain the text content and complete font rendering data.

#### Additional Properties

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | The actual text content |
| `resolution` | `number` | Text rendering resolution |
| `style` | `TextStyle` | Font and text styling |
| `fontData` | `FontData` | Font metrics and glyph definitions |
| `charJSONs` | `array<Display>` | Pre-rendered character paths |

---

## Device Object

The device object contains processing parameters for each element.

```json
"device": {
  "id": "GS009-CLASS-4",
  "power": [5],
  "data": {
    "dataType": "Map",
    "value": [[...]]
  },
  "materialList": [],
  "materialTypeList": [],
  "customProjectData": {
    "tangentialCuttingUuids": [],
    "flyCutUuid2CanvasIds": {}
  }
}
```

### Device Data Structure

The `data` field uses a Map structure where each canvas ID maps to processing settings:

```json
"data": {
  "dataType": "Map",
  "value": [
    ["canvas-uuid", {
      "mode": "LASER_PLANE",
      "data": {
        "LASER_PLANE": {
          "material": 0,
          "lightSourceMode": "uv",
          "thickness": 117,
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
        "value": [[...]]
      }
    }]
  ]
}
```

### Display Processing Settings

Each display element needs processing parameters:

```json
["element-uuid", {
  "isFill": false,
  "type": "PATH",
  "processingType": "VECTOR_ENGRAVING",
  "data": {
    "VECTOR_CUTTING": {...},
    "VECTOR_ENGRAVING": {...},
    "FILL_VECTOR_ENGRAVING": {...},
    "INTAGLIO": {...},
    "INNER_THREE_D": {...}
  },
  "processIgnore": false
}]
```

#### Processing Types

| Type | Description |
|------|-------------|
| `VECTOR_CUTTING` | Cutting through material |
| `VECTOR_ENGRAVING` | Line/outline engraving |
| `FILL_VECTOR_ENGRAVING` | Filled area engraving |
| `INTAGLIO` | Intaglio/relief engraving |
| `INNER_THREE_D` | 3D inner crystal engraving |

---

## Color Encoding

Colors use two formats:

### 1. Hex String
Used for layer tags, fill colors, etc.
```json
"layerTag": "#ff0000"
"fillColor": "#ff0000"
```

### 2. Integer (Decimal RGB)
Used in fill/stroke color properties:
```json
"color": 16711680
```

**Conversion formulas:**
```javascript
// Hex to integer
const int = parseInt('ff0000', 16); // 16711680

// Integer to hex
const hex = '#' + (16711680).toString(16).padStart(6, '0'); // #ff0000
```

**Common colors:**
| Color | Hex | Integer |
|-------|-----|---------|
| Red | #ff0000 | 16711680 |
| Green | #00ff00 | 65280 |
| Blue | #0000ff | 255 |
| Black | #000000 | 0 |
| White | #ffffff | 16777215 |

---

## Complete Working Example

This example creates two overlapping rectangles (40×30mm red and 30×40mm blue) with their centers aligned at point (50, 50):

```json
{
  "canvasId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "canvas": [{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Test Canvas",
    "layerData": {
      "#ff0000": {"name": "Red Layer", "order": 1, "visible": true},
      "#0000ff": {"name": "Blue Layer", "order": 2, "visible": true}
    },
    "groupData": {},
    "displays": [
      {
        "id": "rect-0001-0000-0000-000000000001",
        "name": "Red Rectangle",
        "type": "PATH",
        "x": 30, "y": 35,
        "angle": 0,
        "scale": {"x": 1, "y": 1},
        "skew": {"x": 0, "y": 0},
        "pivot": {"x": 0, "y": 0},
        "localSkew": {"x": 0, "y": 0},
        "offsetX": 30, "offsetY": 35,
        "lockRatio": false,
        "isClosePath": true,
        "zOrder": 1,
        "sourceId": "",
        "groupTag": "",
        "layerTag": "#ff0000",
        "layerColor": "#ff0000",
        "visible": true,
        "originColor": "#ff0000",
        "enableTransform": true,
        "visibleState": true,
        "lockState": false,
        "resourceOrigin": "",
        "customData": {},
        "rootComponentId": "",
        "minCanvasVersion": "0.0.0",
        "fill": {"paintType": "color", "visible": false, "color": 16711680, "alpha": 1},
        "stroke": {"paintType": "color", "visible": true, "color": 16711680, "alpha": 1, "width": 0.5, "cap": "butt", "join": "miter", "miterLimit": 4, "alignment": 0.5},
        "width": 40, "height": 30,
        "points": [],
        "dPath": "M0 0 L40 0 L40 30 L0 30 Z",
        "fillRule": "nonzero",
        "graphicX": 30, "graphicY": 35,
        "isCompoundPath": false,
        "isFill": false,
        "lineColor": 16711680,
        "fillColor": "#ff0000"
      },
      {
        "id": "rect-0002-0000-0000-000000000002",
        "name": "Blue Rectangle",
        "type": "PATH",
        "x": 35, "y": 30,
        "angle": 0,
        "scale": {"x": 1, "y": 1},
        "skew": {"x": 0, "y": 0},
        "pivot": {"x": 0, "y": 0},
        "localSkew": {"x": 0, "y": 0},
        "offsetX": 35, "offsetY": 30,
        "lockRatio": false,
        "isClosePath": true,
        "zOrder": 2,
        "sourceId": "",
        "groupTag": "",
        "layerTag": "#0000ff",
        "layerColor": "#0000ff",
        "visible": true,
        "originColor": "#0000ff",
        "enableTransform": true,
        "visibleState": true,
        "lockState": false,
        "resourceOrigin": "",
        "customData": {},
        "rootComponentId": "",
        "minCanvasVersion": "0.0.0",
        "fill": {"paintType": "color", "visible": false, "color": 255, "alpha": 1},
        "stroke": {"paintType": "color", "visible": true, "color": 255, "alpha": 1, "width": 0.5, "cap": "butt", "join": "miter", "miterLimit": 4, "alignment": 0.5},
        "width": 30, "height": 40,
        "points": [],
        "dPath": "M0 0 L30 0 L30 40 L0 40 Z",
        "fillRule": "nonzero",
        "graphicX": 35, "graphicY": 30,
        "isCompoundPath": false,
        "isFill": false,
        "lineColor": 255,
        "fillColor": "#0000ff"
      }
    ]
  }],
  "extId": "GS009-CLASS-4",
  "extName": "F2 Ultra UV",
  "version": "1.3.6",
  "created": 1737471771000,
  "modify": 1737471771000,
  "device": {
    "id": "GS009-CLASS-4",
    "power": [5],
    "data": {
      "dataType": "Map",
      "value": [["a1b2c3d4-e5f6-7890-abcd-ef1234567890", {
        "mode": "LASER_PLANE",
        "data": {
          "LASER_PLANE": {
            "material": 0,
            "lightSourceMode": "uv",
            "thickness": 117,
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
          "value": [
            ["rect-0001-0000-0000-000000000001", {
              "isFill": false,
              "type": "PATH",
              "processingType": "VECTOR_ENGRAVING",
              "data": {
                "VECTOR_ENGRAVING": {
                  "materialType": "customize",
                  "planType": "dot_cloud",
                  "parameter": {
                    "customize": {
                      "speed": 20,
                      "power": 1,
                      "repeat": 1,
                      "frequency": 40,
                      "enableKerf": false,
                      "kerfDistance": 0
                    }
                  }
                }
              },
              "processIgnore": false
            }],
            ["rect-0002-0000-0000-000000000002", {
              "isFill": false,
              "type": "PATH",
              "processingType": "VECTOR_ENGRAVING",
              "data": {
                "VECTOR_ENGRAVING": {
                  "materialType": "customize",
                  "planType": "dot_cloud",
                  "parameter": {
                    "customize": {
                      "speed": 20,
                      "power": 1,
                      "repeat": 1,
                      "frequency": 40,
                      "enableKerf": false,
                      "kerfDistance": 0
                    }
                  }
                }
              },
              "processIgnore": false
            }]
          ]
        }
      }]]
    },
    "materialList": [],
    "materialTypeList": [],
    "customProjectData": {
      "tangentialCuttingUuids": [],
      "flyCutUuid2CanvasIds": {}
    }
  }
}
```

**Note:** When saving as `.xcs`, the JSON should be minified (no whitespace/newlines).

---

## Implementation Checklist

When generating XCS files programmatically:

- [ ] Generate valid UUID v4 for all IDs
- [ ] Ensure `canvasId` matches the canvas `id`
- [ ] Set `x = offsetX = graphicX` for all elements
- [ ] Set `y = offsetY = graphicY` for all elements
- [ ] Start all dPath data from `M0 0`
- [ ] Include all required top-level fields (`extId`, `extName`, `version`, `created`, `modify`, `device`)
- [ ] Add processing parameters in `device.data` for each display element
- [ ] Match element IDs between `displays` array and `device.data.displays`
- [ ] Use correct color integer encoding for fill/stroke
- [ ] Minify JSON output (single line, no whitespace)

---

## Related Resources

- xTool Creative Space: https://www.xtool.com/pages/software
- SVG Path Specification: https://www.w3.org/TR/SVG/paths.html

---

## Version History

| Date | Changes |
|------|---------|
| 2026-01-21 | Initial documentation with verified working examples |
