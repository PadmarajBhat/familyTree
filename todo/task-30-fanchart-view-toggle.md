# Fix FanChart and Add View Toggle

## Problem Statement
User reported FanChart descendants were not showing correctly and requested a top-level toggle to switch between Tree and FanChart views easily.

## Solution
1.  **View Toggle**: Implemented a "Tree | Fan Chart" segmented toggle at the top center of `TreeViewSection.tsx`, replacing the hidden floating button.
2.  **App State**: Refactored `App.tsx` to use `viewMode` ('tree' | 'fanchart') instead of a transient modal state, treating FanChart as a primary view.
3.  **FanChart Fixes**:
    - Improved robustness of `FanChartView.tsx` descendant builder to safely lookup nodes.
    - Wired up `onResetRoot` to the `ZoomControls` reset button, allowing users to return to the tree root after drilling down.
4.  **Verification**: Verified flipping between views maintains state and descendants render correctly (when available).

## Status
Closed

## Failed Reason
N/A
