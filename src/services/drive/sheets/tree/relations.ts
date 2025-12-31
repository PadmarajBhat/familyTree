
import { gapi } from 'gapi-script';
import type { PersonNode } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet } from './utils';

export const syncAllRelationshipsToSheets = async (allNodes: PersonNode[]): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;

    try {
        const rows: any[][] = [];
        const now = new Date().toISOString();

        allNodes.forEach(fromNode => {
            if (fromNode.parentId) {
                const parents = fromNode.parentId.split('|').filter(Boolean);
                parents.forEach(pId => {
                    const pNode = allNodes.find(n => n.nodeId === pId);
                    rows.push([fromNode.nodeId, pId, 'parent', now, fromNode.name, pNode?.name || '']);
                });
            }
            if (fromNode.spouseIds) {
                fromNode.spouseIds.forEach(sId => {
                    const sNode = allNodes.find(n => n.nodeId === sId);
                    rows.push([fromNode.nodeId, sId, 'spouse', now, fromNode.name, sNode?.name || '']);
                });
            }
        });

        await (gapi.client as any).sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Relationships!A2:F' });
        if (rows.length > 0) {
            await (gapi.client as any).sheets.spreadsheets.values.update({
                spreadsheetId, range: 'Relationships!A2', valueInputOption: 'RAW', resource: { values: rows }
            });
        }
        console.log(`Synced ${rows.length} relationships to Sheets.`);
    } catch (err) {
        console.error("Error syncing relationships to Sheets", err);
    }
};

export const saveRelationToSheets = async (fromId: string, toId: string, type: 'parent' | 'spouse', fromName: string = '', toName: string = ''): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;
    try {
        const row = [fromId, toId, type, new Date().toISOString(), fromName, toName];
        await (gapi.client as any).sheets.spreadsheets.values.append({
            spreadsheetId, range: 'Relationships!A2', valueInputOption: 'RAW', resource: { values: [row] }
        });
    } catch (err) {
        console.error("Error saving relation to Sheets", err);
    }
};
