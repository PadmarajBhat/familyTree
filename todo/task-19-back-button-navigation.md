# Back button navigation

## Problem Statement
Back button in any of the pages should land back to home page it's only in the home page the back button should exit the app.

## Solution
Added `window.history.pushState` logic to `App.tsx` using `useEffect` and `useRef` to track view state transitions. When navigating from 'home' to other views (like 'tree'), a history state is pushed. A generic `popstate` listener then catches the back button press and resets the view to 'home' if currently in another view. This ensures the back button navigates within the app instead of exiting immediately.

## Status
Closed

## Failed Reason
