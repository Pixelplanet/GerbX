/**
 * Advanced Vector Processor using paper.js for boolean operations
 */
import paper from 'paper';

export class VectorProcessor {
    /**
     * Performs boolean subtraction to create the "Full Clearance" path.
     */
    static invert(tracePathData: string, bounds: { x: number, y: number, width: number, height: number }, padding: number = 0): string {
        if (!tracePathData || tracePathData.trim().length === 0) return '';

        const scope = new paper.PaperScope();
        scope.setup(new scope.Size(5000, 5000)); // Even larger for safety (5 meters)

        // Ensure the project works with our coordinates even if they are large
        // paper.js by default centers new items, but importSVG might use absolute coords.

        try {
            // Import the trace SVG path (foreground)
            let svgContent = '';
            if (tracePathData.trim().startsWith('<')) {
                // It's already an SVG fragment (e.g. <g>...</g>)
                // Sanitize color for Math Engine: force all currentColors to black
                const sanitized = tracePathData
                    .replace(/fill="currentColor"/g, 'fill="#000000"')
                    .replace(/stroke="currentColor"/g, 'stroke="#000000"');
                // Wrap in svg to be safe
                svgContent = `<svg xmlns="http://www.w3.org/2000/svg">${sanitized}</svg>`;
            } else {
                // It's just path data
                svgContent = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${tracePathData}" stroke="black" stroke-width="0.1" fill="black"/></svg>`;
            }

            const imported = scope.project.importSVG(svgContent) as paper.Item;

            // Check if import was successful
            if (!imported) {
                console.error('Vector Inversion Error: Failed to import SVG content');
                throw new Error('Failed to import SVG content for inversion');
            }

            // Collect all geometric paths into a single CompoundPath for fast subtraction
            const traces = new scope.CompoundPath({});

            // Get all items that can be converted to or are paths (recursive by default)
            const allGeometricItems = imported.getItems({
                match: (item: any) => {
                    return item instanceof scope.Path ||
                        item instanceof scope.CompoundPath ||
                        item instanceof scope.Shape;
                }
            });

            let hasAnyContent = false;
            for (const item of allGeometricItems as any[]) {
                let pathItem: paper.PathItem | null = null;

                if (item instanceof scope.PathItem) {
                    pathItem = item;
                } else if (item.toPath) {
                    pathItem = item.toPath();
                }

                if (pathItem) {
                    traces.addChild(pathItem);
                    hasAnyContent = true;
                }
            }

            if (!hasAnyContent) return tracePathData;

            // Create board rectangle (background/substrate)
            const board = new scope.Path.Rectangle(
                new scope.Point(bounds.x - padding, bounds.y - padding),
                new scope.Size(bounds.width + (padding * 2), bounds.height + (padding * 2))
            );

            // Clearance = Board - Traces
            // Using subtract on a CompoundPath is efficient in paper.js
            const clearance = board.subtract(traces);
            clearance.simplify(0.001);

            const svg = clearance.exportSVG({ asString: true }) as string;
            const dMatch = svg.match(/d="([^"]+)"/);

            return dMatch ? dMatch[1] : '';
        } catch (err) {
            console.error('Vector Inversion Error:', err);
            return tracePathData;
        }
    }

    /**
     * Path mirroring relative to a specific board center
     */
    static mirror(dPath: string, bounds: { x: number, width: number }): string {
        if (!dPath) return '';

        if (!bounds || bounds.width <= 0) {
            return dPath;
        }

        const centerX = bounds.x + bounds.width / 2;

        // Efficient parsing: segments are separated by commands
        const regex = /([a-df-z])([^a-df-z]*)/gi;
        let result = '';
        let match;
        let count = 0;

        while ((match = regex.exec(dPath)) !== null) {
            const command = match[1];
            const coordsStr = match[2];

            if (!coordsStr.trim()) {
                result += command;
                continue;
            }

            const nums = coordsStr.trim().split(/[\s,]+/);
            if (nums.length < 1) {
                result += command;
                continue;
            }

            const isArc = command.toUpperCase() === 'A';
            const mirroredNums = nums.map((val, idx) => {
                const num = parseFloat(val);
                if (isNaN(num)) return val;

                if (isArc) {
                    // A rx ry x-rot large sweep x y
                    // index 0=rx, 1=ry, 2=xrot, 3=large, 4=sweep, 5=x, 6=y
                    if (idx === 4) {
                        // Sweep flag needs to be inverted for mirroring
                        return (num === 0 ? 1 : 0).toString();
                    }
                    if (idx === 5) {
                        // X coordinate
                        count++;
                        return (centerX + (centerX - num)).toFixed(3);
                    }
                    return val;
                } else {
                    // For M, L, C, S, Q, T - X is at 0, 2, 4...
                    if (idx % 2 === 0) {
                        count++;
                        return (centerX + (centerX - num)).toFixed(3);
                    }
                    return val;
                }
            });

            result += command + mirroredNums.join(' ');
        }

        return result;
    }
}
