# Translation save issue

## Problem Statement
Add or edit member name translations which are out of field are not being saved.

## Solution [Original]
Added `nameTranslations` to the `update_person` tool schema in `tools.ts` to allow Gemini to save translated names. Updated `PersonDetail.tsx` to display these translations in the details list, and added the 'Translations' label to `en.json`.

## Status
Closed

## Failed Reason

## Update 2026-01-23 11:58
**Issue Identified:** `googletrans` usage in `ToolsHandler` was blocking and `to_thread` usage was incorrect for sync library.
**Fix Implemented:**
1.  Verified `asyncio.to_thread` usage for `googletrans`.
2.  Ensured `nameTranslations` is awaited before saving.
3.  Verified `add_person` correctly saves translations.
