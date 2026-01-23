# Gemini chat window reopen issue

## Problem Statement
Gemini chat window close button is automatically reopening it this should not happen. It should close and stay closed until user opens it again.

## Solution (Update)
- Enabled `ping_interval=20` and `ping_timeout=20` in `backend/main.py`.
- Updated `GeminiLive/index.tsx` to include `reconnectAttemptsRef`.
- Limited silent reconnects to 3 attempts.

## Status
Closed

## Failed Reason
Reconnection logic was too aggressive, ignoring user disconnect state on network errors (1006).

# Update [2026-01-23 11:30]

## Problem Statement
1. **Reconnect Loop**: When user stops the session, it often triggers a 1006 error, which the code mistook for a network drop and tried to "silent reconnect".
2. **Auto-Close**: User requested the session to auto-close if there is no audio/conversation for 30 seconds.

## Solution
- **Fix Reconnect**: Updated `onClose` in `GeminiLive/index.tsx` to check `activeRef.current` (user intent) BEFORE checking error codes. If user didn't want it active, we don't reconnect.
- **Auto-Close**: Implemented a 30s timer (`autoCloseTimeoutRef`) that resets on any message (user or model). If it expires, `disconnect()` is called.

## Status
In Progress
