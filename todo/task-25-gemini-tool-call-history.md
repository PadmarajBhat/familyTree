# Gemini tool call history

## Problem Statement
Gemini tools call has to be saved in the chat history.

## Solution
Updated `backend/server/proxy_utils.py` to log tool calls to Firestore (`log_chat` with role `tool-call`) and updated `src/components/GeminiLive/index.tsx` to handle the `tool-call` role when restoring chat history. This ensures that tool usage is persisted and visible when reloading the session.

## Status
Closed

## Failed Reason
