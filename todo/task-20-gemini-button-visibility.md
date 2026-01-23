# Gemini button visibility

## Problem Statement
Gemini button should be shown only in home page rest of the pages should not have Gemini button

## Solution
Modified `App.tsx` to conditionally render the `GeminiLiveButton` only when `init.viewState === 'home'` and the user is signed in. This ensures the button is not visible in the tree view or other pages, complying with the requirement.

## Status
Closed

## Failed Reason
Button was remaining hidden on Home screen if the user navigated back from Tree View while a modal (like Search) was left open, because the state flags were not cleared.

# Update [2026-01-23 11:24]

## Problem Statement
Users reported Gemini button missing on Home screen. Investigation showed `App.tsx` was checking stale flags (`searchOpen`, `editingNodeId`) which persist even after switching to Home view.

## Solution
Updated `App.tsx` to remove dependency on these Tree-View specific flags when `viewState === 'home'`. Now it only checks:
- `init.viewState === 'home'`
- `init.isSignedIn`
- `!showPrivacy` and `!showTerms` (Global overlays)

## Status
Fixed
