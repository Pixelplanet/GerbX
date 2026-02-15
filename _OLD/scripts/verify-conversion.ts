import fs from 'fs';
import path from 'path';
import { parseGerberZip } from '../src/features/parser/utils/gerberParser';
import { GerberToPath } from '../src/features/parser/utils/vectorUtils';

interface ComparisonResult {
    layerName: string;
    gerberFile: string;
    svgRefFile: string;
    status: 'pass' | 'fail' | 'warning';
    metrics: {
        referenceBounds?: { x: number, y: number, width: number, height: number };
        parsedBounds?: { x: number, y: number, width: number, height: number };
        boundsMatch: boolean;
        hasContent: boolean;
        pathLength: number;
        referencePathCount?: number;
    };
    errors: string[];
}

interface VerificationReport {
    timestamp: string;
    totalLayers: number;
    passedLayers: number;
    failedLayers: number;
    warningLayers: number;
    results: ComparisonResult[];
}

const INPUT_GERBER_DIR = path.join(process.cwd(), 'Input files', 'Gerber');
const INPUT_SVG_DIR = path.join(process.cwd(), 'Input files', 'SVG');

async function loadReferenceSVG(svgPath: string): Promise<{ bounds: any, pathCount: number } | null> {
    try {
        const content = fs.readFileSync(svgPath, 'utf-8');

        // Extract viewBox for bounds
        const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
        let bounds = null;
        if (viewBoxMatch) {
            const [x, y, width, height] = viewBoxMatch[1].split(/\s+/).map(parseFloat);
            bounds = { x, y, width, height };
        }

        // Count path elements
        const pathMatches = content.match(/<path /g);
        const pathCount = pathMatches ? pathMatches.length : 0;

        return { bounds, pathCount };
    } catch (e) {
        console.error(`Failed to load reference SVG ${svgPath}:`, e);
        return null;
    }
}

function boundsMatch(b1: any, b2: any, tolerance: number = 0.1): boolean {
    if (!b1 || !b2) return false;

    const withinTolerance = (v1: number, v2: number) => {
        return Math.abs(v1 - v2) <= tolerance;
    };

    return withinTolerance(b1.x, b2.x) &&
        withinTolerance(b1.y, b2.y) &&
        withinTolerance(b1.width, b2.width) &&
        withinTolerance(b1.height, b2.height);
}

async function verifyConversion(): Promise<VerificationReport> {
    const report: VerificationReport = {
        timestamp: new Date().toISOString(),
        totalLayers: 0,
        passedLayers: 0,
        failedLayers: 0,
        warningLayers: 0,
        results: []
    };

    console.log('🔍 Starting Gerber Conversion Verification...\n');

    // Get all Gerber files
    const gerberFiles = fs.readdirSync(INPUT_GERBER_DIR)
        .filter(f => f.endsWith('.gbr'))
        .sort();

    console.log(`Found ${gerberFiles.length} Gerber files\n`);

    for (const gerberFile of gerberFiles) {
        const gerberPath = path.join(INPUT_GERBER_DIR, gerberFile);
        const svgFileName = gerberFile.replace('.gbr', '.svg');
        const svgPath = path.join(INPUT_SVG_DIR, svgFileName);

        const result: ComparisonResult = {
            layerName: gerberFile.replace('.gbr', ''),
            gerberFile,
            svgRefFile: svgFileName,
            status: 'fail',
            metrics: {
                boundsMatch: false,
                hasContent: false,
                pathLength: 0
            },
            errors: []
        };

        report.totalLayers++;

        console.log(`  Verifying: ${gerberFile}`);

        // Check if reference SVG exists
        if (!fs.existsSync(svgPath)) {
            result.errors.push('Reference SVG not found');
            result.status = 'warning';
            report.warningLayers++;
            report.results.push(result);
            console.log(`    ⚠️  Warning: No reference SVG found`);
            continue;
        }

        try {
            // Load reference SVG
            const reference = await loadReferenceSVG(svgPath);
            if (reference) {
                result.metrics.referenceBounds = reference.bounds;
                result.metrics.referencePathCount = reference.pathCount;
            }

            // Parse Gerber file
            const gerberContent = fs.readFileSync(gerberPath, 'utf-8');
            const parsed = GerberToPath.convert(gerberContent);

            result.metrics.parsedBounds = parsed.bounds;
            result.metrics.hasContent = parsed.path.length > 0;
            result.metrics.pathLength = parsed.path.length;

            // Check bounds match
            if (reference && reference.bounds && parsed.bounds) {
                result.metrics.boundsMatch = boundsMatch(reference.bounds, parsed.bounds, 1.0);
            }

            // Determine status
            if (!result.metrics.hasContent) {
                result.errors.push('No content parsed from Gerber');
                result.status = 'fail';
                report.failedLayers++;
                console.log(`    ❌ FAIL: No content parsed`);
            } else if (!result.metrics.boundsMatch) {
                result.errors.push('Bounds mismatch with reference');
                result.status = 'warning';
                report.warningLayers++;
                console.log(`    ⚠️  Warning: Bounds mismatch`);
            } else {
                result.status = 'pass';
                report.passedLayers++;
                console.log(`    ✅ PASS`);
            }

        } catch (e: any) {
            result.errors.push(e.message);
            result.status = 'fail';
            report.failedLayers++;
            console.log(`    ❌ FAIL: ${e.message}`);
        }

        report.results.push(result);
    }

    console.log(`\n📊 Verification Complete:`);
    console.log(`   Total: ${report.totalLayers}`);
    console.log(`   Passed: ${report.passedLayers} ✅`);
    console.log(`   Warnings: ${report.warningLayers} ⚠️`);
    console.log(`   Failed: ${report.failedLayers} ❌`);

    return report;
}

function generateHTMLReport(report: VerificationReport): string {
    const statusIcon = (status: string) => {
        if (status === 'pass') return '✅';
        if (status === 'warning') return '⚠️';
        return '❌';
    };

    const statusColor = (status: string) => {
        if (status === 'pass') return '#10b981';
        if (status === 'warning') return '#f59e0b';
        return '#ef4444';
    };

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Gerber Conversion Verification Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0a0a;
            color: #e5e5e5;
            padding: 2rem;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { 
            font-size: 2rem; 
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 2rem 0;
        }
        .stat-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 1.5rem;
        }
        .stat-label {
            font-size: 0.875rem;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .stat-value {
            font-size: 2.5rem;
            font-weight: bold;
            margin-top: 0.5rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: #1a1a1a;
            border-radius: 12px;
            overflow: hidden;
        }
        th {
            background: #2a2a2a;
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #333;
        }
        td {
            padding: 1rem;
            border-bottom: 1px solid #2a2a2a;
        }
        tr:hover { background: #252525; }
        .status { 
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 600;
        }
        .metrics {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.875rem;
            color: #999;
        }
        .errors {
            color: #ef4444;
            font-size: 0.875rem;
        }
        .bounds {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5rem;
            font-size: 0.75rem;
        }
        .bounds-item {
            background: #0a0a0a;
            padding: 0.5rem;
            border-radius: 4px;
        }
        .timestamp {
            color: #666;
            font-size: 0.875rem;
            margin-top: 2rem;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Gerber Conversion Verification Report</h1>
        <p style="color: #999; margin-bottom: 2rem;">Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-label">Total Layers</div>
                <div class="stat-value">${report.totalLayers}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Passed ✅</div>
                <div class="stat-value" style="color: #10b981;">${report.passedLayers}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Warnings ⚠️</div>
                <div class="stat-value" style="color: #f59e0b;">${report.warningLayers}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Failed ❌</div>
                <div class="stat-value" style="color: #ef4444;">${report.failedLayers}</div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Layer</th>
                    <th>Bounds Comparison</th>
                    <th>Metrics</th>
                    <th>Issues</th>
                </tr>
            </thead>
            <tbody>
                ${report.results.map(r => `
                    <tr>
                        <td>
                            <span class="status" style="color: ${statusColor(r.status)}">
                                ${statusIcon(r.status)} ${r.status.toUpperCase()}
                            </span>
                        </td>
                        <td>
                            <strong>${r.layerName}</strong><br>
                            <span style="font-size: 0.75rem; color: #666;">${r.gerberFile}</span>
                        </td>
                        <td>
                            <div class="bounds">
                                <div class="bounds-item">
                                    <strong>Reference:</strong><br>
                                    ${r.metrics.referenceBounds ?
            `x: ${r.metrics.referenceBounds.x.toFixed(2)}, y: ${r.metrics.referenceBounds.y.toFixed(2)}<br>
                                         w: ${r.metrics.referenceBounds.width.toFixed(2)}, h: ${r.metrics.referenceBounds.height.toFixed(2)}`
            : 'N/A'}
                                </div>
                                <div class="bounds-item">
                                    <strong>Parsed:</strong><br>
                                    ${r.metrics.parsedBounds ?
            `x: ${r.metrics.parsedBounds.x.toFixed(2)}, y: ${r.metrics.parsedBounds.y.toFixed(2)}<br>
                                         w: ${r.metrics.parsedBounds.width.toFixed(2)}, h: ${r.metrics.parsedBounds.height.toFixed(2)}`
            : 'N/A'}
                                </div>
                            </div>
                            <div style="margin-top: 0.5rem; font-size: 0.75rem;">
                                Match: ${r.metrics.boundsMatch ? '✅ Yes' : '❌ No'}
                            </div>
                        </td>
                        <td class="metrics">
                            Path Length: ${r.metrics.pathLength.toLocaleString()}<br>
                            Has Content: ${r.metrics.hasContent ? 'Yes' : 'No'}<br>
                            Ref Paths: ${r.metrics.referencePathCount || 'N/A'}
                        </td>
                        <td class="errors">
                            ${r.errors.length > 0 ? r.errors.join('<br>') : '—'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <p class="timestamp">Report generated at ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>`;
}

async function main() {
    const report = await verifyConversion();

    // Generate HTML report
    const html = generateHTMLReport(report);
    const reportPath = path.join(process.cwd(), 'verification-report.html');
    fs.writeFileSync(reportPath, html);

    console.log(`\n📄 Report saved to: ${reportPath}\n`);

    // Exit with appropriate code
    process.exit(report.failedLayers > 0 ? 1 : 0);
}

main().catch(console.error);
