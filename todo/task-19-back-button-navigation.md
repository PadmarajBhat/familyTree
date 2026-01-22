# Back button navigation

## Problem Statement
Back button in any of the pages should land back to home page it's only in the home page the back button should exit the app.

## Solution
Added `window.history.pushState` logic to `App.tsx` using `useEffect` and `useRef` to track view state transitions. When navigating from 'home' to other views (like 'tree'), a history state is pushed. A generic `popstate` listener then catches the back button press and resets the view to 'home' if currently in another view. This ensures the back button navigates within the app instead of exiting immediately.

## Solution
Updated `App.tsx` to include a single `useEffect` that tracks all modal and view states.
1. `handlePopState` checks flags in priority order (Modals -> Editor -> View) and closes the top-most active item instead of navigating away.
2. `window.history.pushState` is called when any modal opens or view changes, ensuring there is a history entry to "pop" when the user hits Back.

## Status
Closed