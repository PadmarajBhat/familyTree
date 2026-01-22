# Fuzzy search improvement

## Problem Statement
Whenever the name given by the user is not present the fuzzy logic should return the nearest name to what user has said so the board should always come back with some name near to what user has said always.

## Solution
Updated `backend/tools_handler.py` to import `difflib` and leverage `SequenceMatcher` for fuzzy searching. The search logic now checks for both exact substring matches and fuzzy matches (ratio > 0.7) to effectively handle typos (e.g., "Ghandi" -> "Gandhi").

## Status
Closed

## Failed Reason
