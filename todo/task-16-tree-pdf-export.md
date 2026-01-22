# Tree PDF export is still failing

## Problem Statement
Tree pdf export is still failing.

## Solution
Wrapped the `html2canvas` tree capture logic in a `try-catch` block. If the tree visualization fails to render (likely due to CORS issues with images), the error is caught, logged, and a text error message is added to the PDF instead of failing the entire download. This ensures the user at least gets the text and profile details.

## Status
Closed

## Failed Reason
