# Gemini relation finding

## Problem Statement
Gemini should use find relation to identify relation between two persons and explain the same when user asks about relation between two person

## Solution
Updated `backend/tools_handler.py` `get_details` method to resolve and include names for `parentId`, `spouseIds`, and `childrenIds` in a `relatedNames` field. This allows Gemini to immediately see family relationships (e.g., "wife: [Name]") without needing secondary lookups, fixing the issue where it couldn't answer relationship questions.

## Status
Closed

## Failed Reason
