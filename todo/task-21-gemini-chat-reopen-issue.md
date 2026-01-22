# Gemini chat window reopen issue

## Problem Statement
Gemini chat window close button is automatically reopening it this should not happen. It should close and stay closed until user opens it again.

## Solution
Identify a potential race condition where the connection process might hang or proceed after a user cancellation. Implemented a 10s connection timeout in `GeminiLive/index.tsx` to ensure state is reset if connection fails. Also added a check in `onOpen` to verify `active` state before proceeding, ensuring that if a user disconnects while connecting, the session is cleanly aborted.

## Status
Closed

## Failed Reason
