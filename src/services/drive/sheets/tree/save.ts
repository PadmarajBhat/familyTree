
import { gapi } from 'gapi-script';
import type { PersonNode, TreeDocument } from '../../../../logic/types';
import { getOrCreateTreeSpreadsheet } from './utils';

const nodeToRow = (n: PersonNode | Partial<PersonNode>) => [
    n.nodeId, n.name || '', n.gender || '', n.dob || '', n.dod || '', n.email || '', n.phone || '',
    n.address?.freeform || '',
    n.occupation ? JSON.stringify(n.occupation) : '',
    n.education ? JSON.stringify(n.education) : '[]',
    n.hobbies ? JSON.stringify(n.hobbies) : '[]',
    n.notes || '', n.parentId || '',
    (n.spouseIds || []).join('|'), (n.childrenIds || []).join('|'),
    n.editedTime || new Date().toISOString(), n.imageUrl || '',
    n.isEditor ? 'TRUE' : 'FALSE', n.editorSince || ''
];

export const saveNodeToSheets = async (node: Partial<PersonNode> & { nodeId: string }): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;

    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nodes!A2:A' });
        const rows = response.result.values || [];
        const rowIndex = rows.findIndex((row: any[]) => row[0] === node.nodeId);

        const rowData = nodeToRow(node);
        if (rowIndex !== -1) {
            await (gapi.client as any).sheets.spreadsheets.values.update({
                spreadsheetId, range: `Nodes!A${rowIndex + 2}`, valueInputOption: 'RAW',
                resource: { values: [rowData] }
            });
        } else {
            await (gapi.client as any).sheets.spreadsheets.values.append({
                spreadsheetId, range: 'Nodes!A2', valueInputOption: 'RAW',
                resource: { values: [rowData] }
            });
        }
    } catch (err) {
        console.error("Error saving node to Sheets", err);
    }
};

export const saveNodesBatchToSheets = async (nodes: PersonNode[]): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;

    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nodes!A2:A' });
        const existingIds = (response.result.values || []).map((row: any[]) => row[0]);

        const updates: any[] = [];
        const appends: any[] = [];

        nodes.forEach(node => {
            const idx = existingIds.indexOf(node.nodeId);
            if (idx !== -1) updates.push({ range: `Nodes!A${idx + 2}`, values: [nodeToRow(node)] });
            else appends.push(nodeToRow(node));
        });

        if (updates.length > 0) {
            await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
                spreadsheetId, resource: { data: updates, valueInputOption: 'RAW' }
            });
        }
        if (appends.length > 0) {
            await (gapi.client as any).sheets.spreadsheets.values.append({
                spreadsheetId, range: 'Nodes!A2', valueInputOption: 'RAW', resource: { values: appends }
            });
        }
    } catch (err) {
        console.error("Error batch saving nodes", err);
    }
};

export const deleteNodesFromSheets = async (nodeIds: string[]): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;
    try {
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nodes!A2:A' });
        const existingIds = (response.result.values || []).map((row: any[]) => row[0]);

        for (const nodeId of nodeIds) {
            const idx = existingIds.indexOf(nodeId);
            if (idx !== -1) {
                await (gapi.client as any).sheets.spreadsheets.values.clear({ spreadsheetId, range: `Nodes!A${idx + 2}:S${idx + 2}` });
            }
        }
    } catch (err) {
        console.error("Error deleting nodes from Sheets", err);
    }
};

export const saveMetadataToSheets = async (metadata: Record<string, string>): Promise<void> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet();
    if (!spreadsheetId) return;
    try {
        const values = Object.entries(metadata).map(([k, v]) => [k, v]);
        await (gapi.client as any).sheets.spreadsheets.values.update({
            spreadsheetId, range: 'Metadata!A2', valueInputOption: 'RAW', resource: { values }
        });
    } catch (err) {
        console.error("Error saving metadata", err);
    }
};

export const migrateTreeToSheets = async (tree: TreeDocument): Promise<boolean> => {
    const spreadsheetId = await getOrCreateTreeSpreadsheet(tree.treeName);
    if (!spreadsheetId) return false;
    try {
        const nodeData = Object.values(tree.nodes).map(node => nodeToRow(node));
        await (gapi.client as any).sheets.spreadsheets.values.update({
            spreadsheetId, range: 'Nodes!A2', valueInputOption: 'RAW', resource: { values: nodeData }
        });
        await saveMetadataToSheets({ treeName: tree.treeName, rootNodeId: tree.rootNodeId });
        return true;
    } catch (err) {
        console.error("Migration failed", err);
        return false;
    }
};
