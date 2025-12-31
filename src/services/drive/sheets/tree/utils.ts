
import { gapi } from 'gapi-script';
import * as state from '../../state';
import type { PersonNode } from '../../../../logic/types';

export const TREE_NODE_HEADERS = ['NodeID', 'Name', 'Gender', 'DoB', 'DoD', 'Email', 'Phone', 'Address', 'Occupation', 'Education', 'Hobbies', 'Notes', 'ParentID', 'SpouseIDs', 'ChildrenIDs', 'LastUpdated', 'PhotoUrl', 'IsEditor', 'EditorSince'];
export const TREE_RELATION_HEADERS = ['FromID', 'ToID', 'Type', 'Timestamp', 'FromName', 'ToName'];
export const TREE_METADATA_HEADERS = ['Key', 'Value'];

export const rowToNode = (row: any[]): PersonNode => ({
    nodeId: row[0],
    name: row[1] || null,
    gender: row[2] as any,
    dob: row[3] || null,
    dod: row[4] || null,
    email: row[5] || null,
    phone: row[6] || null,
    phoneE164: null,
    imageUrl: row[16] || null,
    dobApprox: { known: false, year: null, month: null, day: null },
    dodApprox: { known: false, year: null, month: null, day: null },
    ageProvided: null,
    dobInferred: false,
    address: { freeform: row[7] || null },
    occupation: row[8] ? JSON.parse(row[8]) : null,
    education: row[9] ? JSON.parse(row[9]) : [],
    hobbies: row[10] ? JSON.parse(row[10]) : [],
    notes: row[11] || null,
    parentId: row[12] || null,
    spouseIds: row[13] ? row[13].split('|').filter(Boolean) : [],
    childrenIds: row[14] ? row[14].split('|').filter(Boolean) : [],
    isEditor: row[17] === 'TRUE',
    editorSince: row[18] || null,
    editedBy: null,
    editedTime: row[15] || null,
});

export const getOrCreateTreeSpreadsheet = async (treeName?: string): Promise<string | null> => {
    if (state.cachedTreeSpreadsheetId) return state.cachedTreeSpreadsheetId;
    try {
        const title = treeName ? `FT_${treeName}` : 'FamilyTree_Data';
        const response = await (gapi.client as any).drive.files.list({
            q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            state.setCachedTreeSpreadsheetId(files[0].id);
            return files[0].id;
        }

        const createResponse = await (gapi.client as any).sheets.spreadsheets.create({
            resource: { properties: { title } }
        });
        const spreadsheetId = createResponse.result.spreadsheetId;

        // Create Nodes, Relations, and Metadata sheets
        await (gapi.client as any).sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    { addSheet: { properties: { title: 'Relationships' } } },
                    { addSheet: { properties: { title: 'Metadata' } } }
                ]
            }
        });

        // Initialize headers
        await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: [
                    { range: 'Sheet1!A1', values: [TREE_NODE_HEADERS] },
                    { range: 'Relationships!A1', values: [TREE_RELATION_HEADERS] },
                    { range: 'Metadata!A1', values: [TREE_METADATA_HEADERS] }
                ],
                valueInputOption: 'RAW'
            }
        });

        // Rename Sheet1 to Nodes
        await (gapi.client as any).sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{ updateSheetProperties: { properties: { sheetId: 0, title: 'Nodes' }, fields: 'title' } }]
            }
        });

        state.setCachedTreeSpreadsheetId(spreadsheetId);
        return spreadsheetId;
    } catch (err) {
        console.error("Error creating tree spreadsheet", err);
        return null;
    }
};
