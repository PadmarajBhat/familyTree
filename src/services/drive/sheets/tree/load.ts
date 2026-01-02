
import { gapi } from 'gapi-script';
import type { PersonNode, ChangeLog } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet, rowToNode } from './utils';

export const loadTreeFromSheets = async (targetSpreadsheetId?: string): Promise<{ nodes: PersonNode[], metadata: Record<string, string>, summary: ChangeLog[] }> => {
    const spreadsheetId = targetSpreadsheetId || await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) throw new Error("Could not access or create tree spreadsheet.");

    try {
        // Ensure all sheets exist before loading
        const { ensureTreeSheetsExist } = await import('./utils');
        await ensureTreeSheetsExist(spreadsheetId);

        const response = await (gapi.client as any).sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: ['Nodes!1:1', 'Nodes!A2:Z', 'Metadata!A2:B', 'ChangeLog!A2:E']
        });

        const valueRanges = response.result.valueRanges;
        const headerRow = valueRanges[0].values?.[0] || [];
        const nodeRows = valueRanges[1].values || [];
        const metaRows = valueRanges[2].values || [];
        const logRows = valueRanges[3].values || [];

        // Build generic header map (normalized keys)
        const headerMap: Record<string, number> = {};
        if (headerRow.length > 0) {
            headerRow.forEach((col: string, idx: number) => {
                if (col) {
                    const normalized = col.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    headerMap[normalized] = idx;
                }
            });
            console.log("Detected Tree Headers (Normalized):", headerMap);
        }

        const nodes: PersonNode[] = nodeRows.map((row: any[]) => rowToNode(row, headerMap));

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
