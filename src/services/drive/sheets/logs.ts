
import { gapi } from 'gapi-script';
import * as state from '../state';

export const getOrCreateSharedLogSheet = async (): Promise<string | null> => {
    if (state.cachedLogSpreadsheetId) return state.cachedLogSpreadsheetId;
    if (import.meta.env.DEV) return 'mock_log_sheet';
    try {
        const response = await (gapi.client as any).drive.files.list({
            q: "name='Gemini_FamilyTree_Logs' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            state.setCachedLogSpreadsheetId(files[0].id);
            return files[0].id;
        }

        const createResponse = await (gapi.client as any).sheets.spreadsheets.create({
            resource: { properties: { title: 'Gemini_FamilyTree_Logs' } }
        });
        const spreadsheetId = createResponse.result.spreadsheetId;
        await (gapi.client as any).sheets.spreadsheets.values.update({
            spreadsheetId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: [['Timestamp', 'Email', 'Type', 'Message', 'Data']] }
        });
        state.setCachedLogSpreadsheetId(spreadsheetId);
        return spreadsheetId;
    } catch (err) {
        console.error("Error creating log sheet", err);
        return null;
    }
};

export const appendGeminiLogToSheets = async (email: string, logEntries: { type: string, text: string, data?: any, timestamp: Date }[]): Promise<void> => {
    const spreadsheetId = await getOrCreateSharedLogSheet();
    if (!spreadsheetId) return;

    if (import.meta.env.DEV) {
        console.log("Dev Mode (Mock Log): would append", JSON.stringify(logEntries));
        return;
    }

    try {
        const rows = logEntries.map(entry => [
            entry.timestamp.toISOString(),
            email,
            entry.type,
            entry.text,
            entry.data ? JSON.stringify(entry.data) : ''
        ]);
        await (gapi.client as any).sheets.spreadsheets.values.append({
            spreadsheetId, range: 'Sheet1!A1', valueInputOption: 'RAW',
            resource: { values: rows }
        });
        console.log(`Appended ${rows.length} log entries to Sheets.`);
    } catch (err) {
        console.error("Error appending logs to Sheets", err);
    }
};
