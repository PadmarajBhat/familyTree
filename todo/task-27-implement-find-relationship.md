# Task 27: Implement find_relationship tool

Gemini needs a way to find the relationship path between two people (e.g., "A is the father of B").
Frontend has this logic, but Backend does not.

## Solution
Implemented `find_relationship` method in `backend/tools_handler.py` using BFS to find the shortest path between two nodes. Added the corresponding tool definition in `src/services/Gemini/client/tools.ts`. Gemini can now use this tool to determine how two people are related (e.g., "A is the Father of B, who is the Wife of X").

## Status
Closed
