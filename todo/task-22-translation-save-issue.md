# Translation save issue

## Problem Statement
Add or edit member name translations which are out of field are not being saved.

## Solution
Added `nameTranslations` to the `update_person` tool schema in `tools.ts` to allow Gemini to save translated names. Updated `PersonDetail.tsx` to display these translations in the details list, and added the 'Translations' label to `en.json`.

## Status
Closed

## Failed Reason
