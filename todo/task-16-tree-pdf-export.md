# Tree PDF export is still failing

## Problem Statement
Tree pdf export is still failing.

## Solution
1. **Resolved TypeError**: Fixed the `TypeError: Cannot read properties of undefined (reading 'freeform')` by using optional chaining (`node.address?.freeform`) in `src/utils/exportPdf.ts`. This ensures the PDF generation doesn't crash if the address object is missing.
2. **Fixed Font Loading**: Addressed the `404 (Not Found)` error for the Kannada font by updating the font URL to use `import.meta.env.BASE_URL`. This ensures the font loads correctly even when the application is deployed to a subpath like `/familyTree/`.

## Status
Closed

## Failed Reason
