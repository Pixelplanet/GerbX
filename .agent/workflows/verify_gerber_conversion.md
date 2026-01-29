---
description: Verify Gerber to SVG conversion accuracy
---

This workflow runs the verification script to compare our Gerber parsing against reference SVG files.

1. Run the verification script
// turbo
```bash
npx tsx scripts/verify-conversion.ts
```

2. Open the HTML report
Use the browser subagent to open `file:///c:/Projects/GerbX/verification-report.html` and capture screenshots of the results.
