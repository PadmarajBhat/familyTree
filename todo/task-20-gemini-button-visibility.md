# Gemini button visibility

## Problem Statement
Gemini button should be shown only in home page rest of the pages should not have Gemini button

## Solution
Modified `App.tsx` to conditionally render the `GeminiLiveButton` only when `init.viewState === 'home'` and the user is signed in. This ensures the button is not visible in the tree view or other pages, complying with the requirement.

## Status
Closed

## Failed Reason
