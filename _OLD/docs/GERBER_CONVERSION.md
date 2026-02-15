# Gerber Conversion Technical Documentation

## Overview

This document explains the Gerber-to-SVG conversion pipeline, common pitfalls, and verification methodology. **Read this before attempting to "fix" Gerber conversion issues.**

## Critical Knowledge: Coordinate Systems

### The Fundamental Issue

**DO NOT compare Gerber parser bounds directly with KiCad-exported SVG viewBox values.**

These represent **different coordinate systems**:

| Source | Coordinate System | Example |
|--------|------------------|---------|
| **KiCad SVG Export** | Page canvas (A4/Letter) | `viewBox="0 0 297 210"` (entire page) |
| **Gerber File** | PCB geometry only | `119.22mm, -116.28mm, 52.19mm, 22.73mm` (actual PCB) |
| **gerber-to-svg Library** | PCB geometry in micrometers | `viewBox="119227.5 -117260 52792.5 24560"` |

### Why They Don't Match

1. **KiCad SVG exports** include the entire page canvas for print/preview purposes
2. **Gerber files** contain only manufacturing coordinates (actual copper, silkscreen, etc.)
3. **Our parsers** correctly extract the manufacturing data, not the page layout

**This is correct behavior, not a bug.**

## Gerber Format Specifications

### Format String (`%FSLAX46Y46*%`)

Modern Gerber X2 files use this format:
- `FS` = Format Statement
- `L` = Leading zero suppression
- `A` = Absolute coordinates
- `X46` = X-axis: 4 integer digits, 6 decimal digits
- `Y46` = Y-axis: 4 integer digits, 6 decimal digits

**Critical**: The decimal count determines the divisor:
- 4 decimals = divide by 10,000
- 6 decimals = divide by 1,000,000 (modern standard)

**Common Bug**: Hardcoding 4 decimal places when files use 6.

### Example Coordinate Parsing

```
Raw Gerber coordinate: X153160000
Format: X46 (6 decimal places)
Calculation: 153160000 / 1000000 = 153.16mm
```

## gerber-to-svg Library Behavior

### Output Characteristics

The library (v4.2.8) outputs SVG with:

```xml
<svg width="52.7925mm" height="24.56mm" 
     viewBox="119227.5 -117260 52792.5 24560">
  <g transform="translate(0,-209960) scale(1,-1)">
    <!-- paths in micrometers -->
  </g>
</svg>
```

**Key Points**:
1. **ViewBox units**: Micrometers (1000x mm)
2. **Transform**: Flips Y-axis and positions geometry
3. **Width/Height**: Correctly scaled to mm
4. **This is correct and high-fidelity output**

### Wrapper Transform

Our wrapper (`gerberToSvgWrapper.ts`) applies:
```typescript
scale = 0.001; // for mm units
wrappedSvg = `<g transform="scale(${scale})">${innerContent}</g>`;
```

This normalizes the micrometer coordinates to millimeters for easier handling.

## Common Mistakes

### ❌ Mistake #1: Comparing Incompatible Bounds

```typescript
// WRONG - Comparing page canvas with PCB geometry
const kicadBounds = { x: 0, y: 0, width: 297, height: 210 };
const gerberBounds = { x: 119.22, y: -116.28, width: 52.19, height: 22.73 };
if (kicadBounds !== gerberBounds) {
  console.error("BROKEN!");  // This will ALWAYS fail!
}
```

### ✅ Correct: Visual or Path Comparison

```typescript
// CORRECT - Compare actual geometry
const referencePathCount = countPathsInSVG(kicadSvg);
const parsedPathCount = countPathsInParsed(gerberData);
// Or better: visual regression testing
```

### ❌ Mistake #2: Wrong Decimal Places

```typescript
// WRONG - Hardcoded 4 decimals
const value = coordinate / 10000;

// CORRECT - Parse from format spec
const fsMatch = gerber.match(/%FS[LT][AI]X(\d)(\d)Y(\d)(\d)\*%/);
const decimals = parseInt(fsMatch[4]); // 6 for modern files
const value = coordinate / Math.pow(10, decimals);
```

### ❌ Mistake #3: Assuming Library is Broken

Before concluding the library is broken:
1. Check if the SVG **renders correctly** in a browser
2. Verify the paths are **present and valid**
3. Test **vector inversion** with the actual SVG fragments
4. Check for **rendering/CSS conflicts**

The library works correctly in 99% of cases. Issues are usually in:
- Rendering pipeline
- Transform stacking
- Vector inversion logic
- CSS conflicts with dangerouslySetInnerHTML

## Verification Strategy

### What to Test

| ✅ Valid Tests | ❌ Invalid Tests |
|---------------|------------------|
| SVG renders in preview | Bounds match KiCad export |
| Paths are present | Absolute coordinates match |
| Geometry looks correct | ViewBox matches exactly |
| Inversion works | File size matches |

### Recommended Verification

1. **Visual Regression Testing**
   ```typescript
   // Compare screenshots of rendered output
   await expect(page).toHaveScreenshot('layer-F_Cu.png');
   ```

2. **Path Presence Testing**
   ```typescript
   // Ensure geometry was extracted
   expect(parsed.path.length).toBeGreaterThan(0);
   expect(parsed.svg).toContain('<path');
   ```

3. **Functional Testing**
   ```typescript
   // Test actual features work
   const inverted = VectorProcessor.invert(layer.content, bounds);
   expect(inverted).toBeDefined();
   ```

## Code Locations

### Key Files

- **Custom Parser**: `src/features/parser/utils/vectorUtils.ts` (GerberToPath class)
- **Library Wrapper**: `src/features/parser/utils/gerberToSvgWrapper.ts`
- **Orchestrator**: `src/features/parser/utils/gerberParser.ts`
- **Vector Ops**: `src/features/parser/utils/vectorProcessor.ts`
- **Rendering**: `src/features/parser/components/PCBPreview.tsx`

### Bug Fix Reference

**Fixed 2026-01-29**: Custom parser was using 4 decimal places instead of 6
- File: `vectorUtils.ts` line 78
- Change: `decimalPlaces = 6` (was 4)
- Impact: All modern Gerber X2 files now parse correctly

## Troubleshooting Guide

### "Conversion is broken"

1. **Check if it's actually broken**:
   - Does `npm run dev` show the layers?
   - Open browser DevTools, any errors?
   - View the actual SVG output (save to file)

2. **Identify the real issue**:
   - Is it parsing? (no paths generated)
   - Is it rendering? (paths exist but don't show)
   - Is it inversion? (solid copper instead of clearance)
   - Is it transforms? (geometry in wrong place)

3. **Debug systematically**:
   ```bash
   # Test raw library output
   npx tsx scripts/test-gerber-to-svg.ts
   
   # Test custom parser
   npx tsx scripts/debug-parser.ts
   
   # Run verification
   npx tsx scripts/verify-conversion.ts
   ```

4. **Test in Docker**:
   ```bash
   # Rebuild container to test changes
   docker-compose down
   docker-compose up --build
   ```

### "Bounds don't match reference"

**This is expected.** See "Coordinate Systems" section above.

### "Layer appears as solid block"

This is likely:
- Vector inversion not working
- Masking issue in PCBPreview.tsx
- CSS conflict with dangerouslySetInnerHTML

**Not** a parsing issue.

## References

- [Gerber Format Specification](https://www.ucamco.com/en/gerber/downloads)
- [gerber-to-svg Library](https://github.com/tracespace/tracespace)
- [Paper.js Documentation](http://paperjs.org/reference/)

## Changelog

- **2026-01-29**: Initial documentation
  - Documented coordinate system mismatch issue
  - Fixed custom parser decimal places bug
  - Created verification infrastructure
  - Established correct testing methodology
