
import { gapi } from 'gapi-script';
import type { PersonNode, ChangeLog } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet, rowToNode } from './utils';

export const loadTreeFromSheets = async (targetSpreadsheetId?: string): Promise<{ nodes: PersonNode[], metadata: Record<string, string>, summary: ChangeLog[] }> => {
    const spreadsheetId = targetSpreadsheetId || await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) throw new Error("Could not access or create tree spreadsheet.");

    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: ['Nodes!A2:S', 'Metadata!A2:B', 'ChangeLog!A2:E']
        });

        const nodeRows = response.result.valueRanges[0].values || [];
        const metaRows = response.result.valueRanges[1].values || [];
        const logRows = response.result.valueRanges[2].values || [];

        const nodes: PersonNode[] = nodeRows.map((row: any[]) => rowToNode(row));

        const metadata: Record<string, string> = {};
        metaRows.forEach((row: any[]) => {
            if (row[0]) metadata[row[0]] = row[1];
        });

        // Parse ChangeLogs
        const summary: any[] = logRows.map((row: any[]) => ({
            editedTime: row[0],
            editedBy: row[1],
            changes: row[2],
            rootNodeName: row[3],
            structured: row[4] ? JSON.parse(row[4]) : []
        })).sort((a: any, b: any) => new Date(b.editedTime).getTime() - new Date(a.editedTime).getTime());

        return { nodes, metadata, summary };
    } catch (err) {
        console.error("Error loading tree from Sheets", err);
        throw err;
    }
};
