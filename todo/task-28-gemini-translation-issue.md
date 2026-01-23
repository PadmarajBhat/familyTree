# Gemini Member Addition Translation Issue

## Problem Statement
When a member is added through Gemini (voice/chat), the translations for their name (e.g., to Kannada/Hindi) are not saved.
They likely only get the English name provided by the model.

## Solution
(To be determined) - Likely need to invoke the translation service (Google/Azure/Local) when processing the `add_member` tool call, similar to how the manual "Add Member" form does it.

## Status
Open
