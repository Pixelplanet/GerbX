# Testing Guide

This project uses Playwright for End-to-End (E2E) testing.

## Prerequisites

- Node.js installed
- Dependencies installed (`npm install`)
- Playwright browsers installed (`npx playwright install chromium`)

## Running Tests

To run the E2E test suite:

```bash
npm run test:e2e
```

This command will:
1. Start the local development server (`npm run dev`)
2. Run the Playwright tests against it
3. Output the results

## Writing Tests

Test files are located in `tests/e2e/`.
Follow the pattern in `tests/e2e/gerbx.spec.ts`.

## Implementation Plan Coverage

The tests cover:
- **Application Initialization**: Verifies title and initial state.
- **Gerber File Upload**: Uploads `Input files/Gerber.zip` and confirms processing.
- **Layer Recognition**: Checks that layers are parsed and listed.
- **Visual Regression**: Takes screenshots of the PCB preview to ensure pixel-perfect rendering output (`pcb-preview.png`).
- **Export Validation**: Simulates clicking "Export .XCS", intercepts the file download, and validates that the JSON content contains valid vector data.
- **Feature Interaction**: Tests the "Invert Paths" toggle and verifies it visually affects the preview.

## Notes on Visual Testing
On the first run, Playwright will generate reference snapshots. On subsequent runs, it will compare against these. If you intentionally change the UI/Rendering, you may need to update snapshots:
```bash
npx playwright test --update-snapshots
```
