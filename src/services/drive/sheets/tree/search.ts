
import { gapi } from 'gapi-script';
import type { PersonNode } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet, rowToNode } from './utils';

export const searchNodesInSheets = async (query: string): Promise<PersonNode[]> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return [];
    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nodes!A2:S' });
        const rows = response.result.values || [];
        const lowerQuery = query.toLowerCase();

        return rows
            .filter((row: any[]) => row[1] && row[1].toLowerCase().includes(lowerQuery))
            .map((row: any[]) => rowToNode(row));
    } catch (err) {
        console.error("Error searching in Sheets", err);
        return [];
    }
};

export const getRecentNodesFromSheets = async (limit: number = 10): Promise<PersonNode[]> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return [];
    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nodes!A2:S' });
        const rows = response.result.values || [];

        return rows
            .sort((a: any[], b: any[]) => new Date(b[15] || 0).getTime() - new Date(a[15] || 0).getTime())
            .slice(0, limit)
            .map((row: any[]) => rowToNode(row));
    } catch (err) {
        console.error("Error getting recent nodes from Sheets", err);
        return [];
    }
};
