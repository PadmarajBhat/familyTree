# Interview mode save issue

## Problem Statement
Germany (Gemini) did interview a person and regularly made an update but the database is not updated with all the information only date of birth and only date of birth is saved education occupation location were not saved.

## Solution
Updated `PersonDetail.tsx` to explicitly fetch and display the `education`, `occupation`, `location`, and `hobbies` fields from the `PersonNode`. Also added corresponding translation keys to `src/locales/en.json`. The data was likely being saved correctly by the backend, but the frontend was filtering it out as it wasn't in the display list.

## Solution
1. Updated `PersonDetail.tsx` to explicitly fetch and display `education`, `occupation`, `location`, and `hobbies`.
2. Updated `backend/tools_handler.py` to properly merge `location` updates (including `zipcode`) with existing data, preventing data loss during partial updates.

## Status
Closed