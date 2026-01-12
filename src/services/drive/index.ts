import { TreeService } from '../TreeService';

// SHIM: This file prevents build errors while we remove GDrive dependency.
// It will eventually be replaced by direct BackendService/Firestore calls.

export const initGoogleClient = async (_callback?: (signedIn: boolean) => void) => {
    if (_callback) _callback(true);
    return true;
};
export const signIn = async () => { };
export const signOut = () => { };
export const getUserProfile = async () => ({ email: 'padmarajbhat@gmail.com', name: 'Padmaraj Bhat' });

export const listTreeFiles = async () => [{ id: 'default', name: 'Family Tree', modifiedTime: new Date().toISOString() }];
export const getFileContent = async (_id: string) => await TreeService.fetchFullTree(_id);
export const updateTreeFile = async (_id: string, _content: any, _summary?: string, _isRename?: boolean) => {
    console.log("updateTreeFile called (Shim: doing nothing)");
    return true;
};
export const saveTreeFile = async (name: string, content: any, _summary: string) => {
    // Connect to backend to create tree
    const owner = content.meta?.createdBy || 'unknown@user.com';
    try {
        const res = await TreeService.createTree(name, owner);
        return { id: res.treeId, name: res.name, ...content };
    } catch (e) {
        console.error("Failed to create tree", e);
        throw e;
    }
};
export const renameFile = async (_id: string, _newName: string) => true;

export const uploadImage = async (_file: File) => "https://via.placeholder.com/150";
export const getPhotoUrl = (url: string | null) => url || "";
export const deleteFile = async (_url: string) => true;



// Shim: In this app, we might need a way to get the current user's email 
// if it's not passed. For now, we'll expose a way to pass it or rely on a global/mock.
// However, the existing call signature in Home.tsx is `getPreferences()`.
// We might need to update Home.tsx to pass the email.

export const getPreferences = async (email?: string) => {
    if (!email) return {};
    try {
        return await TreeService.fetchPreferences(email);
    } catch (e) {
        console.error("Failed to fetch preferences via WebSocket", e);
        return {};
    }
};

export const saveUserPreferences = async (email: string, prefs: any) => {
    try {
        await TreeService.savePreferences(email, prefs);
    } catch (e) {
        console.error("Failed to save preferences", e);
    }
};
// Re-export or alias if needed
export const updateUserStarredTrees = async (email: string, trees: string[]) => {
    // This looks like a preference update (starred trees)
    // We can map this to saving preferences
    // Logic: fetch existing, update starred, save.
    // BUT for now let's just save it as a preference field
    await saveUserPreferences(email, { starredTrees: trees });
};

// Locking Shim
export const acquireLock = async (_id: string) => "mock-lock-id";
export const releaseLock = async (_lockId: string) => true;
export const checkLock = async (_id: string) => null;
export const getLock = async () => "mock-lock-id"; // Alias if needed

export const grantWritePermission = async (_id: string, _email: string) => true;
export const grantLockFilePermission = async (_id: string, _email: string) => true;

export const isMockAuth = true;

export type { DriveFile } from './types';
