
import { gapi } from 'gapi-script';
import type { PersonNode } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet, rowToNode } from './utils';

export const loadTreeFromSheets = async (): Promise<{ nodes: PersonNode[], metadata: Record<string, string> }> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) throw new Error("Could not access or create tree spreadsheet.");

    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: ['Nodes!A2:S', 'Metadata!A2:B']
        });

        const nodeRows = response.result.valueRanges[0].values || [];
        const metaRows = response.result.valueRanges[1].values || [];

        const nodes: PersonNode[] = nodeRows.map((row: any[]) => rowToNode(row));

        const metadata: Record<string, string> = {};
        metaRows.forEach((row: any[]) => {
            if (row[0]) metadata[row[0]] = row[1];
        });

        return { nodes, metadata };
    } catch (err) {
        console.error("Error loading tree from Sheets", err);
        throw err;
    }
};
