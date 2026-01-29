
import gerberParser from 'gerber-parser';

export interface RenderResult {
    svg: string;
    bounds: { x: number; y: number; width: number; height: number };
}

export const renderGerberWithCustomParser = (gerberString: string): RenderResult => {

    // Setup Parser
    const parser = gerberParser({
        places: [4, 6],
        zero: 'L',
    });

    // Parse Sync
    // @ts-ignore
    const commands = parser.parseSync(gerberString);

    // State
    let svgContent = '';
    let currentX = 0;
    let currentY = 0;
    let currentTool: string | null = null;
    let tools: Record<string, any> = {};
    let macros: Record<string, any[]> = {}; // Store macro definitions
    let isRegion = false;
    let regionPath: string[] = [];
    let interpolationMode: 'i' | 'cw' | 'ccw' = 'i';
    let unitScale = 1;

    // Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const updateBounds = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };

    // Helpers
    const toMM = (n: number) => n * unitScale;
    const fmt = (n: number) => toMM(n).toFixed(4);

    const getArcPath = (startX: number, startY: number, endX: number, endY: number, i: number, j: number, mode: 'cw' | 'ccw'): string => {
        const cx = startX + i;
        const cy = startY + j;
        const r = Math.sqrt(i * i + j * j);
        const startAngle = Math.atan2(startY - cy, startX - cx);
        const endAngle = Math.atan2(endY - cy, endX - cx);
        let diff = endAngle - startAngle;
        if (mode === 'cw') {
            if (diff > 0) diff -= 2 * Math.PI;
        } else {
            if (diff < 0) diff += 2 * Math.PI;
        }
        const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
        const sweepFlag = mode === 'cw' ? 0 : 1;
        return `A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweepFlag} ${fmt(endX)} ${fmt(endY)}`;
    };

    // --- MACRO RENDERING ENGINE ---
    const evaluate = (val: number | Function, mods: any): number => {
        if (typeof val === 'function') {
            try { return val(mods); } catch { return 0; }
        }
        return val as number;
    };

    const renderMacro = (macroName: string, params: number[], startX: number, startY: number) => {
        const blocks = macros[macroName];
        if (!blocks) return;

        // Build mods object { $1: val, ... }
        const mods: Record<string, number> = {};
        if (params) {
            params.forEach((p, i) => {
                mods[`$${i + 1}`] = p;
            });
        }

        for (const block of blocks) {
            // Treat exposure 0 (clear) as additive for now to ensure visibility of pads
            // if (block.exp === 0) continue; 

            if (block.type === 'circle') {
                // Primitive 1: 1, exp, dia, x, y
                // Properties often hidden in closure functions or named differently.
                // Try standard keys. 
                // If keys are missing in AST, try to guess or skip.
                const dia = evaluate(block.dia || block.diameter, mods);
                const x = evaluate(block.x || block.cx, mods);
                const y = evaluate(block.y || block.cy, mods);

                if (!isNaN(dia)) {
                    const r = dia / 2;
                    // Coords are relative to macro origin (startX, startY)
                    const cx = startX + x;
                    const cy = startY + y;

                    svgContent += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="currentColor" />`;

                    // Bounds
                    const r_mm = toMM(r);
                    const cx_mm = toMM(cx);
                    const cy_mm = toMM(cy);
                    updateBounds(cx_mm - r_mm, cy_mm - r_mm);
                    updateBounds(cx_mm + r_mm, cy_mm + r_mm);
                }
            }
            else if (block.type === 'vect') {
                // Primitive 20: 20, exp, width, x1, y1, x2, y2, rot
                const width = evaluate(block.width, mods);
                const x1 = evaluate(block.x1, mods);
                const y1 = evaluate(block.y1, mods);
                const x2 = evaluate(block.x2, mods);
                const y2 = evaluate(block.y2, mods);

                const absX1 = startX + x1;
                const absY1 = startY + y1;
                const absX2 = startX + x2;
                const absY2 = startY + y2;

                svgContent += `<line x1="${fmt(absX1)}" y1="${fmt(absY1)}" x2="${fmt(absX2)}" y2="${fmt(absY2)}" stroke="currentColor" stroke-width="${fmt(width)}" stroke-linecap="round" />`;

                updateBounds(toMM(absX1), toMM(absY1));
                updateBounds(toMM(absX2), toMM(absY2));
            }
            else if (block.type === 'outline') {
                // Primitive 4: 4, exp, points[], rot
                // points array of functions
                if (block.points && Array.isArray(block.points)) {
                    const pts: string[] = [];
                    for (let i = 0; i < block.points.length; i += 2) {
                        const px = evaluate(block.points[i], mods);
                        const py = evaluate(block.points[i + 1], mods);
                        if (!isNaN(px) && !isNaN(py)) {
                            const absX = startX + px;
                            const absY = startY + py;
                            pts.push(`${fmt(absX)},${fmt(absY)}`);
                            updateBounds(toMM(absX), toMM(absY));
                        }
                    }
                    if (pts.length > 0) {
                        svgContent += `<polygon points="${pts.join(' ')}" fill="currentColor" />`;
                    }
                }
            }
            // Add other primitives (CenterLine Rect 21, Polygon 5) as needed
            // Rect (21)
            else if (block.type === 'center-line' || block.type === 'rect') { // Check exact type key
                const w = evaluate(block.width, mods);
                const h = evaluate(block.height, mods);
                const x = evaluate(block.x || block.cx, mods);
                const y = evaluate(block.y || block.cy, mods);

                const absX = startX + x;
                const absY = startY + y;

                svgContent += `<rect x="${fmt(absX - w / 2)}" y="${fmt(absY - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="currentColor" />`;

                const w_mm = toMM(w);
                const h_mm = toMM(h);
                const cx_mm = toMM(absX);
                const cy_mm = toMM(absY);
                updateBounds(cx_mm - w_mm / 2, cy_mm - h_mm / 2);
                updateBounds(cx_mm + w_mm / 2, cy_mm + h_mm / 2);
            }
        }
    };
    // ----------------------------

    // Iterate
    for (const cmd of commands as any[]) {
        if (cmd.type === 'tool') {
            tools[cmd.code] = cmd.tool;
        }
        else if (cmd.type === 'macro') {
            // Store macro definition
            macros[cmd.name] = cmd.blocks;
        }
        else if (cmd.type === 'set') {
            if (cmd.prop === 'units') {
                if (cmd.value === 'in') unitScale = 25.4;
                else unitScale = 1;
            }
            else if (cmd.prop === 'region') {
                isRegion = cmd.value;
                if (isRegion) {
                    regionPath = [`M ${fmt(currentX)} ${fmt(currentY)}`];
                } else {
                    if (regionPath.length > 0) {
                        regionPath.push('Z');
                        svgContent += `<path d="${regionPath.join(' ')}" fill="currentColor" stroke="none" fill-rule="evenodd" />`;
                    }
                    regionPath = [];
                }
            } else if (cmd.prop === 'tool') {
                currentTool = cmd.value;
            } else if (cmd.prop === 'mode') {
                interpolationMode = cmd.value;
            }
        }
        else if (cmd.type === 'op') {
            const { op, coord } = cmd;
            const x = coord.x !== undefined ? coord.x : currentX;
            const y = coord.y !== undefined ? coord.y : currentY;

            updateBounds(toMM(x), toMM(y));

            if (op === 'move') {
                if (isRegion) {
                    regionPath.push(`M ${fmt(x)} ${fmt(y)}`);
                }
                currentX = x;
                currentY = y;
            }
            else if (op === 'int') { // Interpolate
                let i = coord.i || 0;
                let j = coord.j || 0;

                if (isRegion) {
                    if (interpolationMode === 'i') {
                        regionPath.push(`L ${fmt(x)} ${fmt(y)}`);
                    } else {
                        const arcCmd = getArcPath(currentX, currentY, x, y, i, j, interpolationMode);
                        regionPath.push(arcCmd);
                    }
                } else {
                    const toolObj = currentTool ? tools[currentTool] : null;
                    let width = 0.1;
                    if (toolObj && toolObj.shape === 'circle') width = toolObj.params[0];
                    else if (toolObj && toolObj.shape === 'rect') width = toolObj.params[0];
                    // Macros don't usually have width unless they map to a primitive?

                    if (interpolationMode === 'i') {
                        svgContent += `<line x1="${fmt(currentX)}" y1="${fmt(currentY)}" x2="${fmt(x)}" y2="${fmt(y)}" stroke="currentColor" stroke-width="${fmt(width)}" stroke-linecap="round" />`;
                    } else {
                        const arcCmd = getArcPath(currentX, currentY, x, y, i, j, interpolationMode);
                        svgContent += `<path d="M ${fmt(currentX)} ${fmt(currentY)} ${arcCmd}" stroke="currentColor" stroke-width="${fmt(width)}" fill="none" stroke-linecap="round" />`;
                    }
                }
                currentX = x;
                currentY = y;
            }
            else if (op === 'flash') {
                const toolObj = currentTool ? tools[currentTool] : null;
                if (!toolObj) continue;

                if (macros[toolObj.shape]) {
                    // Render COMPOUND SHAPE via Macro
                    renderMacro(toolObj.shape, toolObj.params, x, y);
                }
                else if (toolObj.shape === 'circle') {
                    const r = toolObj.params[0] / 2;
                    svgContent += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="currentColor" />`;
                    const x_mm = toMM(x), y_mm = toMM(y), r_mm = toMM(r);
                    updateBounds(x_mm - r_mm, y_mm - r_mm);
                    updateBounds(x_mm + r_mm, y_mm + r_mm);
                }
                else if (toolObj.shape === 'rect') {
                    const w = toolObj.params[0];
                    const h = toolObj.params[1];
                    svgContent += `<rect x="${fmt(x - w / 2)}" y="${fmt(y - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="currentColor" />`;
                    const x_mm = toMM(x), y_mm = toMM(y), w_mm = toMM(w), h_mm = toMM(h);
                    updateBounds(x_mm - w_mm / 2, y_mm - h_mm / 2);
                    updateBounds(x_mm + w_mm / 2, y_mm + h_mm / 2);
                }
                else if (toolObj.shape === 'obround') {
                    const w = toolObj.params[0];
                    const h = toolObj.params[1];
                    svgContent += `<rect x="${fmt(x - w / 2)}" y="${fmt(y - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(Math.min(w, h) / 2)}" fill="currentColor" />`;
                }
                currentX = x;
                currentY = y;
            }
        }
    }

    if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }

    return {
        svg: `<g>${svgContent}</g>`,
        bounds: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        }
    };
};
