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
