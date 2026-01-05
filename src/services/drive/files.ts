
import { gapi } from 'gapi-script';

export interface UserPreferences {
    defaultTreeName?: string;
    starredTreeNames?: string[];
    [key: string]: any;
}

// --- Mock Drive Implementation for Local Dev ---
const MOCK_STORAGE_KEY_PREFIX = 'mock_drive_file_';
const MOCK_METADATA_KEY = 'mock_drive_metadata';

const getMockMetadata = (): any[] => {
    const meta = localStorage.getItem(MOCK_METADATA_KEY);
    return meta ? JSON.parse(meta) : [];
};

const saveMockMetadata = (meta: any[]) => {
    localStorage.setItem(MOCK_METADATA_KEY, JSON.stringify(meta));
};

export const listTreeFiles = async () => {
    if (import.meta.env.DEV) {
        console.log("Dev Mode: Listing files from Local Mock Storage");
        let meta = getMockMetadata();
        // Seed initial file if empty
        if (meta.length === 0) {
            const seedId = 'mock_tree_1';
            const seedFile = { id: seedId, name: 'FT_Dev_Sample.json', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: new Date().toISOString() };
            meta.push(seedFile);
            saveMockMetadata(meta);

            // Create dummy tree content
            const dummyTree = {
                treeName: 'FT_Dev_Sample',
                nodes: {
                    "root": { nodeId: "root", name: "Dev Root", gender: "male", spouseIds: [], type: "root" },
                    "user_node": { nodeId: "user_node", name: "Padmaraj Bhat (Dev)", gender: "male", email: "padmarajbhat@gmail.com", parentId: "root", spouseIds: [], childrenIds: [] }
                },
                rootNodeId: "root",
                meta: { nodeCount: 2 },
                version: "1.0",
                formatVersion: "1.0",
                summary: []
            };
            localStorage.setItem(MOCK_STORAGE_KEY_PREFIX + seedId, JSON.stringify(dummyTree));
        }
        return meta.filter((f: any) => f.name.startsWith('FT_'));
    }

    try {
        const response = await (gapi.client as any).drive.files.list({
            q: "mimeType='application/vnd.google-apps.spreadsheet' and (name contains 'FT_') and trashed=false",
            fields: 'files(id, name, modifiedTime, mimeType, owners)',
            orderBy: 'name'
        });
        const files = response.result.files || [];
        // Optional: extra filter to ensure name starts with FT_ (query 'contains' is broader)
        return files.filter((f: any) => f.name.startsWith('FT_'));
    } catch (err) {
        console.error("Error listing files", err);
        return [];
    }
};

export const renameFile = async (fileId: string, newName: string): Promise<void> => {
    try {
        if (!newName.toLowerCase().endsWith('.json')) newName += '.json';
        await (gapi.client as any).drive.files.update({
            fileId: fileId,
            resource: { name: newName }
        });
    } catch (err) {
        console.error("Error renaming file", err);
        throw err;
    }
};

export const getPreferences = async (): Promise<UserPreferences> => {
    if (import.meta.env.DEV) {
        const prefs = localStorage.getItem('mock_user_prefs');
        return prefs ? JSON.parse(prefs) : {};
    }

    try {
        const response = await (gapi.client as any).drive.files.list({
            q: "name='user_preferences.json'",
            spaces: 'appDataFolder',
            fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            const content = await getFileContent(files[0].id);
            return typeof content === 'string' ? JSON.parse(content) : content;
        }
    } catch (err) {
        console.error("Error getting preferences", err);
    }
    return {};
};

export const savePreferences = async (prefs: UserPreferences): Promise<void> => {
    if (import.meta.env.DEV) {
        localStorage.setItem('mock_user_prefs', JSON.stringify(prefs));
        return;
    }

    try {
        const response = await (gapi.client as any).drive.files.list({
            q: "name='user_preferences.json'",
            spaces: 'appDataFolder',
            fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            await updateTreeFile(files[0].id, prefs, "Updating user preferences");
        } else {
            await (gapi.client as any).drive.files.create({
                resource: { name: 'user_preferences.json', parents: ['appDataFolder'] },
                media: { mimeType: 'application/json', body: JSON.stringify(prefs) }
            });
        }
    } catch (err) {
        console.error("Error saving preferences", err);
    }
};

export const updateUserPreference = async (email: string, defaultTreeName: string): Promise<void> => {
    const prefs = await getPreferences();
    prefs.defaultTreeName = defaultTreeName;
    await savePreferences(prefs);
    console.log(`Updated default tree preference for ${email} to ${defaultTreeName}`);
};

export const updateUserStarredTrees = async (email: string, starredTreeNames: string[]): Promise<void> => {
    const prefs = await getPreferences();
    prefs.starredTreeNames = starredTreeNames;
    await savePreferences(prefs);
    console.log(`Updated starred trees preference for ${email} to ${starredTreeNames.join(', ')}`);
};

export const getFileContent = async (fileId: string) => {
    if (import.meta.env.DEV) {
        const content = localStorage.getItem(MOCK_STORAGE_KEY_PREFIX + fileId);
        if (content) {
            try { return JSON.parse(content); } catch (e) { return content; }
        }
        return null;
    }

    try {
        const response = await (gapi.client as any).drive.files.get({ fileId: fileId, alt: 'media' });
        if (typeof response.result === 'string') {
            try {
                return JSON.parse(response.result);
            } catch (e) {
                return response.result;
            }
        }
        return response.result;
    } catch (err) {
        console.error("Error getting file content", err);
        throw err;
    }
};

export const saveTreeFile = async (name: string, content: unknown) => {
    try {
        const fileName = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
        const response = await (gapi.client as any).drive.files.create({
            resource: { name: fileName, mimeType: 'application/json' },
            media: { mimeType: 'application/json', body: JSON.stringify(content) }
        });
        return response.result;
    } catch (err) {
        console.error("Error saving tree file", err);
        throw err;
    }
};

export const updateTreeFile = async (fileId: string, content: unknown, description?: string, _unlock: boolean = false) => {
    if (import.meta.env.DEV) {
        localStorage.setItem(MOCK_STORAGE_KEY_PREFIX + fileId, JSON.stringify(content));
        return;
    }

    try {
        await (gapi.client as any).drive.files.update({
            fileId: fileId,
            resource: { description: description || "Manual update" },
            media: { mimeType: 'application/json', body: JSON.stringify(content) }
        });
    } catch (err) {
        console.error("Error updating tree file", err);
        throw err;
    }
};

export const deleteFile = async (fileId: string): Promise<void> => {
    if (import.meta.env.DEV) {
        localStorage.removeItem(MOCK_STORAGE_KEY_PREFIX + fileId);
        const meta = getMockMetadata();
        const newMeta = meta.filter(f => f.id !== fileId);
        saveMockMetadata(newMeta);
        return;
    }

    try {
        await (gapi.client as any).drive.files.delete({ fileId: fileId });
    } catch (err) {
        console.error("Error deleting file", err);
        throw err;
    }
};

export const copyFile = async (fileId: string, newName: string): Promise<string> => {
    try {
        const response = await (gapi.client as any).drive.files.copy({
            fileId: fileId,
            resource: { name: newName }
        });
        return response.result.id;
    } catch (err) {
        console.error("Error copying file", err);
        throw err;
    }
};
