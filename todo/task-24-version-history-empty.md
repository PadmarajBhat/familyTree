# Version History Empty for New Adds

## Problem Statement
When adding a new person (especially via Gemini), the action was not appearing in the Version History log.

## Update 2026-01-23 11:58
**Solution Implemented:**
1.  **Backend Logging**: Updated `add_person` in `backend/tools_handler.py` to explicitly call `self.log_audit` with action "ADD".
2.  **Attribution**: Updated `ToolsHandler.execute` to pass `user_email` to `add_person`.
3.  **Frontend**: Verified `VersionHistory.tsx` renders "ADD" events correctly.

## Status
Closed

## Failed Reason
N/A
