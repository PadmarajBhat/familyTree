
import { gapi } from 'gapi-script';

export interface UserPreferences {
    defaultTreeName?: string;
    starredTreeNames?: string[];
    [key: string]: any;
}

export const listTreeFiles = async () => {
    try {
        const response = await (gapi.client as any).drive.files.list({
            q: "(mimeType='application/json' or mimeType='application/vnd.google-apps.spreadsheet') and name contains 'FT_' and trashed=false",
            fields: 'files(id, name, modifiedTime, mimeType)',
            orderBy: 'name'
        });
        const files = response.result.files || [];
        return files.filter((f: any) => !f.name.toLowerCase().startsWith('lock'));
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
