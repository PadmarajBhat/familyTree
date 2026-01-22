# Version history empty

## Problem Statement
Version history page has no content.

## Solution
Added `GET_HISTORY` handler to `backend/server/client_handler.py`. This handler receives the `GET_HISTORY` request via WebSocket, calls `FamilyTreeStore.get_history_logs`, and returns the history logs to the client. This resolves the issue where the version history was empty because the backend was not processing the request.

## Status
Closed

## Failed Reason
