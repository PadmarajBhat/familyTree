
import { gapi } from 'gapi-script';
import * as state from '../../state';
import type { PersonNode } from '../../../../logic/types';

export const TREE_NODE_HEADERS = ['NodeID', 'Name', 'Gender', 'DoB', 'DoD', 'Email', 'Phone', 'Address', 'Occupation', 'Education', 'Hobbies', 'Notes', 'ParentID', 'SpouseIDs', 'ChildrenIDs', 'LastUpdated', 'PhotoUrl', 'IsEditor', 'EditorSince'];
export const TREE_RELATION_HEADERS = ['FromID', 'ToID', 'Type', 'Timestamp', 'FromName', 'ToName'];
export const TREE_CHANGELOG_HEADERS = ['EditedTime', 'EditedBy', 'Changes', 'RootNodeName', 'StructuredData'];
export const TREE_METADATA_HEADERS = ['Key', 'Value'];

const safeParseJSON = (val: any, fallback: any = null) => {
    if (!val) return fallback;
    if (typeof val !== 'string') return val;
    try {
        return JSON.parse(val);
    } catch (e) {
        // If it's not JSON, return as is (for strings like "Karnataka" that should have been arrays but weren't)
        // or return as a single-element array if the destination expect one.
        if (Array.isArray(fallback)) return [val];
        return val;
    }
};

const splitIDs = (val: any): string[] => {
    if (!val) return [];
    const str = val.toString();
    // Support pipe, comma, or semicolon as separators
    return str.split(/[|,;]/).map((s: string) => s.trim()).filter(Boolean);
};

export const rowToNode = (row: any[], headerMap?: Record<string, number>): PersonNode => {
    const idx = (name: string, defaultIdx: number) => headerMap && headerMap[name] !== undefined ? headerMap[name] : defaultIdx;

    return {
        nodeId: (row[idx('NodeID', 0)] || '').toString().trim(),
        name: row[idx('Name', 1)] || null,
        gender: (row[idx('Gender', 2)] || '').toString().trim() as any,
        dob: row[idx('DoB', 3)] || null,
        dod: row[idx('DoD', 4)] || null,
        email: (row[idx('Email', 5)] || '').toString().trim() || null,
        phone: (row[idx('Phone', 6)] || '').toString().trim() || null,
        phoneE164: null,
        imageUrl: row[idx('PhotoUrl', 16)] || null,
        dobApprox: { known: false, year: null, month: null, day: null },
        dodApprox: { known: false, year: null, month: null, day: null },
        ageProvided: null,
        dobInferred: false,
        address: { freeform: row[idx('Address', 7)] || null },
        occupation: safeParseJSON(row[idx('Occupation', 8)]),
        education: safeParseJSON(row[idx('Education', 9)], []),
        hobbies: safeParseJSON(row[idx('Hobbies', 10)], []),
        notes: row[idx('Notes', 11)] || null,
        parentId: (row[idx('ParentID', 12)] || '').toString().trim() || null,
        spouseIds: splitIDs(row[idx('SpouseIDs', 13)]),
        childrenIds: splitIDs(row[idx('ChildrenIDs', 14)]),
        isEditor: (row[idx('IsEditor', 17)] || '').toString().trim().toUpperCase() === 'TRUE',
        editorSince: row[idx('EditorSince', 18)] || null,
        editedBy: null,
        editedTime: row[idx('LastUpdated', 15)] || null,
    };
};

export const getOrCreateTreeSpreadsheet = async (treeName?: string): Promise<string | null> => {
    if (state.cachedTreeSpreadsheetId) return state.cachedTreeSpreadsheetId;
    try {
        const sanitized = (treeName || 'Data').trim().replace(/\s+/g, '_');
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const title = `FT_${sanitized}_${dateStr}`;

        // 1. Search for ANY version of this tree (ignoring date for discovery if needed, 
        // but let's stick to name-prefix matching for specific trees)
        const prefix = `FT_${sanitized}_`;
        const response = await (gapi.client as any).drive.files.list({
            q: `name contains '${prefix}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: 'files(id, name, modifiedTime)',
            orderBy: 'modifiedTime desc'
        });
        const files = response.result.files;

        if (files && files.length > 0) {
            const latestFile = files[0];
            const latestFileName = latestFile.name;
            const isToday = latestFileName.includes(dateStr);

            if (!isToday) {
                console.log(`Latest file ${latestFileName} is from a previous day. Creating new daily file...`);
                // Rename old file to include 'backup' if not already? Or just leave it as is 
                // since the date is already in the name.
                if (!latestFileName.startsWith('backup_')) {
                    const { renameFile } = await import('../../files');
                    await renameFile(latestFile.id, `backup_${latestFileName}`);
                }

                // Create new fresh file byproduct of today's date
                const { copyFile } = await import('../../files');
                const newFileId = await copyFile(latestFile.id, title);
                console.log(`Created new daily file ${title} with id ${newFileId}`);

                state.setCachedTreeSpreadsheetId(newFileId);
                return newFileId;
            }

            state.setCachedTreeSpreadsheetId(latestFile.id);
            return latestFile.id;
        }

        // Fallback search for legacy names if the prefix search failed
        if (!treeName) {
            const legacyResponse = await (gapi.client as any).drive.files.list({
                q: `(name='FamilyTree_Data' or name='FT_MainTree') and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
                fields: 'files(id, name, modifiedTime)'
            });
            if (legacyResponse.result.files?.length > 0) {
                const legacyFile = legacyResponse.result.files[0];
                // Rename legacy to new format
                const { renameFile } = await import('../../files');
                await renameFile(legacyFile.id, title);
                state.setCachedTreeSpreadsheetId(legacyFile.id);
                return legacyFile.id;
            }
        }

        const createResponse = await (gapi.client as any).sheets.spreadsheets.create({
            resource: { properties: { title } }
        });
        const spreadsheetId = createResponse.result.spreadsheetId;

        // Create Nodes, Relations, Metadata, and ChangeLog sheets
        await (gapi.client as any).sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    { addSheet: { properties: { title: 'Relationships' } } },
                    { addSheet: { properties: { title: 'Metadata' } } },
                    { addSheet: { properties: { title: 'ChangeLog' } } }
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
                    { range: 'Metadata!A1', values: [TREE_METADATA_HEADERS] },
                    { range: 'ChangeLog!A1', values: [TREE_CHANGELOG_HEADERS] }
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

const ensureInProgressCache: Record<string, Promise<void>> = {};

/**
 * Ensures all required sheets exist in the spreadsheet.
 * If any are missing, they are created and initialized with headers.
 */
export const ensureTreeSheetsExist = async (spreadsheetId: string): Promise<void> => {
    // If a request is already in progress for this ID, wait for it.
    if (Object.prototype.hasOwnProperty.call(ensureInProgressCache, spreadsheetId)) {
        console.log(`Waiting for existing ensureTreeSheetsExist process for ${spreadsheetId}...`);
        return ensureInProgressCache[spreadsheetId];
    }

    const run = async () => {
        try {
            const response = await (gapi.client as any).sheets.spreadsheets.get({ spreadsheetId });
            const sheets = response.result.sheets || [];
            const existingTitles = sheets.map((s: any) => s.properties.title);

            const requiredSheets = [
                { title: 'Nodes', headers: TREE_NODE_HEADERS },
                { title: 'Relationships', headers: TREE_RELATION_HEADERS },
                { title: 'Metadata', headers: TREE_METADATA_HEADERS },
                { title: 'ChangeLog', headers: TREE_CHANGELOG_HEADERS }
            ];

            const requests: any[] = [];
            const headerUpdates: any[] = [];

            for (const req of requiredSheets) {
                if (!existingTitles.includes(req.title)) {
                    console.log(`Sheet '${req.title}' missing in ${spreadsheetId}. Creating...`);
                    requests.push({ addSheet: { properties: { title: req.title } } });
                    headerUpdates.push({
                        range: `${req.title}!A1`,
                        values: [req.headers]
                    });
                }
            }

            if (requests.length > 0) {
                await (gapi.client as any).sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests }
                });

                // Initialize headers for the new sheets
                await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    resource: {
                        data: headerUpdates,
                        valueInputOption: 'RAW'
                    }
                });
            }
        } catch (err) {
            console.error("Error ensuring tree sheets exist", err);
        } finally {
            delete ensureInProgressCache[spreadsheetId];
        }
    };

    ensureInProgressCache[spreadsheetId] = run();
    return ensureInProgressCache[spreadsheetId];
};
