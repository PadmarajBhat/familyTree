# Gemini button is pushed to right

## Problem Statement
Gemini button is pushed to right

## Solution
Modified `GeminiLive.css` to center the button using `left: 50%` and `transform: translateX(-50%)`, removing the `right: 20px` property. This ensures the button is centered at the bottom of the screen as expected.

## Solution
Modified `src/App/App.tsx` to include additional checks for `editingNodeId`, `fanChartOpen`, `findRelationOpen`, `versionHistoryOpen`, `searchOpen`, and `collaboratorsOpen`. The Gemini button is now only visible when `viewState` is 'home' AND no other modals/editors are open.

## Status
Closed