/**
 * Advanced Gerber to SVG Path converter
 */
export class GerberToPath {
    static convert(gerberText: string): { path: string, bounds: any } {
        if (!gerberText) return { path: '', bounds: { x: 0, y: 0, width: 0, height: 0 } };

        let pathData = ''; // Main path string

        let currentX = 0;
        let currentY = 0;
        let lastX = 0;
        let lastY = 0;
        let hasLastPoint = false;
        let dCode = null;
        let isFirstMove = true;
        let currentTool = '10'; // Default tool D10
        let lastDCode = 2; // Default start state is Move (2)
        let isRegionMode = false;

        // Tool Dictionary: { '10': 0.5, '11': 2.0 } (Sizes in mm usually)
        const apertures: Record<string, number> = {};

        // Path data per tool: { '10': "M...", '11': "M..." }
        // We will output a set of paths. For now, to keep string return type, we might need a hack 
        // OR we return a slightly complex string that valid SVG parsers ignore? 
        // Actually, returning multiple <path> strings is better but our interface is string.
        // Let's stick to generating one Mega Path D string but we lose width info.
        // WAIT. The user issue is "Diagonal Lines". HATCHING.
        // We MUST render thick lines.

        // CHANGE: We will return an SVG Fragment string "<path d='...' stroke-width='...' /><path ... />"
        // This requires the consuming component to render it inside <g> or dangerouslySetInnerHTML?
        // PCBPreview expects `d={layer.content}` and renders ONE path.
        // This is the bottleneck.

        // TEMP FIX: We will return the Path Data 'd' as usual, BUT we will parse Aperture sizes
        // and if we detect hatching (repeated lines), we rely on a global "average" width?
        // NO.

        // Let's Parse Apertures first.
        // %ADD10C,0.500*%
        const addMatches = gerberText.match(/%ADD(\d+)C,([\d.]+)\*%/g);
        if (addMatches) {
            addMatches.forEach(m => {
                const parts = m.match(/%ADD(\d+)C,([\d.]+)\*%/);
                if (parts) {
                    apertures[parts[1]] = parseFloat(parts[2]);
                }
            });
        }

        // If we have apertures, we should try to use them.
        // Since we can only return one string for 'd', we can't vary width.
        // UNLESS we calculate the 'Average Copper Width' and return it?
        // or We change the return type? No, interface `PCBLayer` has `content: string`.

        // NEW STRATEGY: 
        // We will maintain the 'd' string logic for now, but I will make the stroke-width in PCBPreview DEPEND on the layer content if possible?
        // or just hardcode a thicker default for now.

        // Actually, if the user sees lines, the hatch pitch is likely > 0.6mm.
        // Let's try to detect the "Hatch".

        // BETTER: We will assume the largest aperture is the fill tool.
        // Let's store the Max Aperture found.
        let maxAperture = 0.2; // default 0.2mm
        Object.values(apertures).forEach(v => {
            if (v > maxAperture) maxAperture = v;
        });

        // Scale handling...

        // 1. Detect Format Specification (FS)
        // Format: %FS[L|T][A|I]X<int><dec>Y<int><dec>*%

        // Parse FS defaults
        let decimalPlaces = 6; // Default to 6 (modern Gerber X2 standard is 4.6 = 1000000 divisor)
        let zeroSuppression = 'L'; // L=Leading (default), T=Trailing
        let coordinateMode = 'A'; // A=Absolute (default), I=Incremental

        // Check for FS command - Robust Regex
        // Matches %FSLAX46Y46... which means 4 integer digits, 6 decimal digits
        const fsMatch = gerberText.match(/%FS([LT])([AI])X(\d)(\d)Y(\d)(\d)\*%/);
        if (fsMatch) {
            zeroSuppression = fsMatch[1];
            coordinateMode = fsMatch[2]; // A or I
            // The 4th capture group is the DECIMAL part - this is what we need!
            decimalPlaces = parseInt(fsMatch[4]); // For X46, this gives us 6
        } else {
            // Try simpler match if partial
            const simpleFs = gerberText.match(/%FS([LT])([AI]).*X(\d)(\d)/);
            if (simpleFs) {
                zeroSuppression = simpleFs[1];
                coordinateMode = simpleFs[2];
                decimalPlaces = parseInt(simpleFs[4]); // Decimal part
            }
        }

        let divisor = Math.pow(10, decimalPlaces);

        const isIncremental = (coordinateMode === 'I') || gerberText.includes('G91');

        // 1. Clean data: normalize terminators and filter junk
        // Gerber commands are strictly terminated by *. 
        const unifiedText = gerberText.replace(/\*/g, '§§');
        const blocks = unifiedText.split('§§');

        const pathDataArray: string[] = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasAnyPoint = false;

        for (let block of blocks) {
            block = block.trim();
            if (!block) continue;
            const upperBlock = block.toUpperCase();

            // Skip parameter blocks that were already parsed or just start/end markers
            if (upperBlock.startsWith('%')) {
                // Check if FS is inside this block (some files have %FS...*%)
                const fsMatch = upperBlock.match(/X(\d)(\d)Y(\d)(\d)/);
                if (fsMatch) {
                    divisor = Math.pow(10, parseInt(fsMatch[2]));
                }
                continue;
            }

            const toolMatch = upperBlock.match(/D(\d+)/);
            if (toolMatch && parseInt(toolMatch[1]) >= 10) {
                currentTool = toolMatch[1];
                continue;
            }

            let dCode: number | null = null;
            const blockContent = upperBlock;

            // Handle G-codes affecting state
            if (block.includes('G00')) {
                lastDCode = 2; // Rapid Move
                dCode = 2;
            } else if (block.includes('G01')) {
                lastDCode = 1; // Linear Interpolation
            }

            if (block.includes('G36')) {
                isRegionMode = true; // Start Region
            }
            if (block.includes('G37')) {
                isRegionMode = false; // End Region
                pathDataArray.push('Z '); // Close the region path
            }

            // Extract coordinates
            // Manual parsing instead of regex for better speed
            let xMatchFound = false;
            let yMatchFound = false;
            let newX = currentX;
            let newY = currentY;

            const xIndex = block.indexOf('X');
            if (xIndex !== -1) {
                const rest = block.substring(xIndex + 1);
                // Extract until next letter or end
                const match = rest.match(/^([-+]?\d*\.?\d+)/);
                if (match) {
                    const val = parseFloat(match[1]);
                    const finalVal = match[1].includes('.') ? val : val / divisor;
                    if (isIncremental && !isFirstMove) newX += finalVal; else newX = finalVal;
                    xMatchFound = true;
                }
            }

            const yIndex = block.indexOf('Y');
            if (yIndex !== -1) {
                const rest = block.substring(yIndex + 1);
                const match = rest.match(/^([-+]?\d*\.?\d+)/);
                if (match) {
                    const val = parseFloat(match[1]);
                    const finalVal = match[1].includes('.') ? val : val / divisor;
                    if (isIncremental && !isFirstMove) newY += finalVal; else newY = finalVal;
                    yMatchFound = true;
                }
            }

            if (xMatchFound || yMatchFound) {
                currentX = newX;
                currentY = newY;

                // Track bounds
                minX = Math.min(minX, currentX);
                minY = Math.min(minY, currentY);
                maxX = Math.max(maxX, currentX);
                maxY = Math.max(maxY, currentY);
                hasAnyPoint = true;
            }

            // D-code at end
            const dIndex = block.indexOf('D');
            if (dIndex !== -1) {
                const rest = block.substring(dIndex + 1);
                const dVal = parseInt(rest);
                if (dVal === 1 || dVal === 2 || dVal === 3) {
                    dCode = dVal;
                    lastDCode = dVal;
                }
            }

            // Determine operation
            const effectiveOp = dCode !== null ? dCode : lastDCode;

            // Emit path data
            if (xMatchFound || yMatchFound || dCode !== null) {
                const xF = currentX.toFixed(3);
                const yF = currentY.toFixed(3);

                if (effectiveOp === 2) {
                    pathDataArray.push(`M${xF} ${yF} `);
                    isFirstMove = false;
                    lastX = currentX;
                    lastY = currentY;
                    hasLastPoint = true;
                } else if (effectiveOp === 1) {
                    if (isFirstMove || isRegionMode || !hasLastPoint) {
                        pathDataArray.push(`${(isFirstMove || !hasLastPoint) ? 'M' : 'L'}${xF} ${yF} `);
                        isFirstMove = false;
                        hasLastPoint = true;
                    } else {
                        // DRAW LINE as REGION (Thick track)
                        const w = apertures[currentTool] || 0.2;
                        const dx = currentX - lastX;
                        const dy = currentY - lastY;
                        const len = Math.sqrt(dx * dx + dy * dy);

                        if (len > 0.001) {
                            const nx = (-dy / len) * (w / 2);
                            const ny = (dx / len) * (w / 2);

                            const p1x = (lastX + nx).toFixed(3);
                            const p1y = (lastY + ny).toFixed(3);
                            const p2x = (currentX + nx).toFixed(3);
                            const p2y = (currentY + ny).toFixed(3);
                            const p3x = (currentX - nx).toFixed(3);
                            const p3y = (currentY - ny).toFixed(3);
                            const p4x = (lastX - nx).toFixed(3);
                            const p4y = (lastY - ny).toFixed(3);

                            // Keep tracks as individual polygons for better boolean ops, 
                            // but for board outline (no tool width usually) we want a line.
                            if ((apertures[currentTool] || 0) > 0) {
                                pathDataArray.push(`M${p1x} ${p1y} L${p2x} ${p2y} L${p3x} ${p3y} L${p4x} ${p4y} Z `);
                                // IMPORTANT: Since we broke the path into a rectangle, 
                                // we must ensure the "current" point for the NEXT line is still centered.
                                pathDataArray.push(`M${xF} ${yF} `);
                            } else {
                                pathDataArray.push(`L${xF} ${yF} `);
                            }
                        } else {
                            pathDataArray.push(`L${xF} ${yF} `);
                        }
                    }
                    lastX = currentX;
                    lastY = currentY;
                    hasLastPoint = true;
                } else if (effectiveOp === 3) {
                    // FLASH: Draw a small circle representing the pad
                    const r = (apertures[currentTool] || 0.4) / 2;
                    const rF = r.toFixed(3);
                    const xL = (currentX - r).toFixed(3);
                    const xR = (currentX + r).toFixed(3);
                    // M x-r y A r r 0 1 0 x+r y A r r 0 1 0 x-r y Z
                    pathDataArray.push(`M${xL} ${yF} A${rF} ${rF} 0 1 0 ${xR} ${yF} A${rF} ${rF} 0 1 0 ${xL} ${yF} Z `);
                    isFirstMove = true; // Flashes usually don't continue the line
                }
            }
        }

        const bounds = hasAnyPoint ? {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        } : { x: 0, y: 0, width: 0, height: 0 };

        return { path: pathDataArray.join('').trim(), bounds };
    }

    static getBounds(layers: { content: string, bounds?: any }[]) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasAny = false;

        layers.forEach(layer => {
            if (layer.bounds && layer.bounds.width > 0) {
                minX = Math.min(minX, layer.bounds.x);
                minY = Math.min(minY, layer.bounds.y);
                maxX = Math.max(maxX, layer.bounds.x + layer.bounds.width);
                maxY = Math.max(maxY, layer.bounds.y + layer.bounds.height);
                hasAny = true;
                return;
            }

            if (!layer.content) return;
            const b = this.calculatePathBounds(layer.content);
            if (b.width > 0 || b.height > 0) {
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
                hasAny = true;
            }
        });

        if (!hasAny || minX === Infinity) return { x: 0, y: 0, width: 100, height: 100 };

        return {
            x: minX,
            y: minY,
            width: Math.max(0.1, maxX - minX),
            height: Math.max(0.1, maxY - minY)
        };
    }

    static calculatePathBounds(content: string) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasAny = false;

        // Match all coordinate pairs in the path
        const matches = content.match(/[-+]?\d*\.?\d+/g);
        if (matches) {
            for (let i = 0; i < matches.length; i += 2) {
                if (i + 1 >= matches.length) break;
                const x = parseFloat(matches[i]);
                const y = parseFloat(matches[i + 1]);
                if (!isNaN(x) && !isNaN(y)) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    hasAny = true;
                }
            }
        }

        if (!hasAny) return { x: 0, y: 0, width: 0, height: 0 };
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
}
