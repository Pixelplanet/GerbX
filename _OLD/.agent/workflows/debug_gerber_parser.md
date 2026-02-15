---
description: Run the Gerber Parser visual debugger
---

This workflow runs the standalone parser script on a test Gerber pattern and generates a `debug-output.html` file.
It then uses the browser subagent to snapshot this file, allowing you to see the parser's logic in action.

1. Run the debug script
// turbo
npx tsx scripts/debug_parser.ts

2. View the result
Use the `browser_subagent` to open `file:///c:/Projects/GerbX/debug-output.html` and take a screenshot.
