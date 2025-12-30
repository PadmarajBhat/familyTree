import { gapi } from 'gapi-script';
import { CONFIG } from '../config';
import type { PersonNode, TreeDocument } from '../logic/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

let gapiInitedPromise: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let accessToken: string | null = null;
let refreshInterval: any = null;
let onAuthErrorCallback: ((error: string) => void) | null = null;

export const setAuthErrorCallback = (cb: (error: string) => void) => {
    onAuthErrorCallback = cb;
};

const setupTokenRefreshMonitor = () => {
    if (refreshInterval) clearInterval(refreshInterval);

    refreshInterval = setInterval(() => {
        const tokenExpires = localStorage.getItem('gapi_token_expires');
        if (!tokenExpires || !tokenClient) return;

        const expiresAt = parseInt(tokenExpires, 10);
        const now = Date.now();
        const timeLeftMs = expiresAt - now;

        // Refresh 10 minutes before expiry (600,000 ms)
        if (timeLeftMs > 0 && timeLeftMs < 10 * 60 * 1000) {
            console.log(`Token expiring in ${(timeLeftMs / 1000 / 60).toFixed(1)}m. Triggering proactive silent refresh...`);
            tokenClient.requestAccessToken({ prompt: 'none' });
        } else if (timeLeftMs <= 0) {
            console.warn("Token already expired. Monitor will stop and rely on App error handling or manual sign-in.");
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 60000); // Check every 1 minute
};

// Helper to wait for the Google Identity Services global object
const waitForGoogle = (timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (typeof google !== 'undefined') {
            resolve();
            return;
        }

        const start = Date.now();
        const interval = setInterval(() => {
            if (typeof google !== 'undefined') {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject(new Error("Timeout waiting for Google library to load"));
            }
        }, 100);
    });
};

export const initGoogleClient = (updateSigninStatus: (isSignedIn: boolean) => void): Promise<void> => {
    if (gapiInitedPromise) {
        return gapiInitedPromise;
    }

    gapiInitedPromise = new Promise((resolve, reject) => {
        // Load the GAPI client for Drive API calls
        gapi.load('client', () => {
            console.log("GAPI loaded, initializing client...");
            gapi.client.init({
                apiKey: CONFIG.API_KEY,
                discoveryDocs: [
                    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
                    'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest'
                ],
            }).then(() => {
                console.log("Client initialized (API Key), now loading Drive and Sheets APIs...");
                return Promise.all([
                    gapi.client.load('drive', 'v3'),
                    gapi.client.load('sheets', 'v4')
                ]);
            }).then(() => {
                console.log("Drive and Sheets APIs loaded successfully.");
                return waitForGoogle();
            }).then(() => {
                // Initialize GIS Token Client
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.CLIENT_ID,
                    scope: CONFIG.SCOPES,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    callback: (tokenResponse: any) => {
                        console.log("GIS Token Callback received:", tokenResponse);
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                            localStorage.setItem('gapi_token', tokenResponse.access_token);
                            if (tokenResponse.expires_in) {
                                const expiresInSec = Number(tokenResponse.expires_in);
                                const expiresAt = Date.now() + (expiresInSec * 1000);
                                localStorage.setItem('gapi_token_expires', expiresAt.toString());
                            }
                            gapi.client.setToken(tokenResponse);
                            updateSigninStatus(true);
                        } else {
                            if (tokenResponse && (tokenResponse.error === 'interaction_required' || tokenResponse.error === 'access_denied')) {
                                if (onAuthErrorCallback) onAuthErrorCallback(tokenResponse.error);
                            }
                        }
                    },
                });

                // Silent login: Check if we have a valid token stored
                const storedToken = localStorage.getItem('gapi_token');
                const tokenExpires = localStorage.getItem('gapi_token_expires');

                if (storedToken && tokenExpires) {
                    const expiresAt = parseInt(tokenExpires, 10);
                    const now = Date.now();

                    if (expiresAt > now + (2 * 60 * 1000)) {
                        accessToken = storedToken;
                        gapi.client.setToken({ access_token: storedToken });

                        getUserProfile().then(profile => {
                            if (profile) {
                                updateSigninStatus(true);
                            } else {
                                localStorage.removeItem('gapi_token');
                                localStorage.removeItem('gapi_token_expires');
                                updateSigninStatus(false);
                            }
                        }).catch(() => {
                            localStorage.removeItem('gapi_token');
                            localStorage.removeItem('gapi_token_expires');
                            updateSigninStatus(false);
                        });
                    } else {
                        localStorage.removeItem('gapi_token');
                        localStorage.removeItem('gapi_token_expires');
                        updateSigninStatus(false);
                    }
                } else {
                    updateSigninStatus(false);
                }

                setupTokenRefreshMonitor();
                resolve();
            }).catch((error: unknown) => {
                console.error("CRITICAL ERROR: Google Client Init or Drive API Load failed", error);
                reject(error);
            });
        });
    });

    return gapiInitedPromise;
};

export const signIn = () => {
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        console.error("Token client not initialized");
    }
};

export const signOut = () => {
    if (accessToken) {
        const token = accessToken;
        google.accounts.oauth2.revoke(token, () => {
            console.log("Token revoked");
            accessToken = null;
            // Clear stored tokens
            localStorage.removeItem('gapi_token');
            localStorage.removeItem('gapi_token_expires');
            // Reload to clear all state
            window.location.reload();
        });
    }
};

export const listTreeFiles = async () => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            // Filter out files that start with 'delete_' or 'backup_' (or contain them, but ideally start with)
            // Drive API query 'not name contains' is safer for general filtering.
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name contains 'json' and not name contains 'lock_' and not name contains 'delete_' and not name contains 'backup_' and name != 'preferences.json'`,
            fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, description)',
            orderBy: 'createdTime desc', // Load latest created file
        });

        return response.result.files;
    } catch (err) {
        console.error("Error listing files", err);
        throw err;
    }
};

export const renameFile = async (fileId: string, newName: string): Promise<void> => {
    const metadata = {
        name: newName,
    };

    const accessToken = gapi.auth.getToken().access_token;

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: new Headers({
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify(metadata),
        });

        if (!response.ok) {
            throw new Error(`Failed to rename file: ${response.statusText}`);
        }

        console.log(`File ${fileId} renamed to ${newName}`);
    } catch (err) {
        console.error("Error renaming file", err);
        throw err;
    }
};

export interface UserPreferences {
    [email: string]: {
        defaultTreeName?: string;
        starredTreeNames?: string[];
    };
}

export const getPreferences = async (): Promise<UserPreferences> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = 'preferences.json'`,
            fields: 'files(id, name)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            const content = await getFileContent(files[0].id);
            return content as UserPreferences;
        }
        return {};
    } catch (err) {
        console.error("Error fetching preferences", err);
        return {};
    }
};

export const savePreferences = async (prefs: UserPreferences): Promise<void> => {
    try {
        // Check if file exists to update or create
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = 'preferences.json'`,
            fields: 'files(id)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            await updateTreeFile(files[0].id, prefs, "User Preferences");
        } else {
            await saveTreeFile("preferences.json", prefs, "User Preferences");
        }
    } catch (err) {
        console.error("Error saving preferences", err);
        throw err;
    }
};

export const updateUserPreference = async (email: string, defaultTreeName: string): Promise<void> => {
    // Simple lock-free approach for now, assuming low contention on preferences
    const prefs = await getPreferences();
    if (!prefs[email]) {
        prefs[email] = {};
    }
    prefs[email].defaultTreeName = defaultTreeName;
    await savePreferences(prefs);
};

export const updateUserStarredTrees = async (email: string, starredTreeNames: string[]): Promise<void> => {
    const prefs = await getPreferences();
    if (!prefs[email]) {
        prefs[email] = {};
    }
    prefs[email].starredTreeNames = starredTreeNames;
    // Also update legacy defaultTreeName to the first star if exists
    if (starredTreeNames.length > 0) {
        prefs[email].defaultTreeName = starredTreeNames[0];
    } else {
        delete prefs[email].defaultTreeName;
    }
    await savePreferences(prefs);
};

export const getFileContent = async (fileId: string) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        return response.result; // This should be the JSON object
    } catch (err) {
        console.error("Error getting file content", err);
        throw err;
    }
};

export const saveTreeFile = async (name: string, content: unknown, description?: string) => {
    const fileContent = JSON.stringify(content, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        name: name,
        parents: [CONFIG.DRIVE_TREE_FOLDER_ID],
        mimeType: 'application/json',
        description: description || "",
    };

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s Timeout

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return await response.json();
    } catch (err) {
        console.error("Error saving file", err);
        throw err;
    }
};

export const updateTreeFile = async (fileId: string, content: unknown, description?: string, _unlock: boolean = false) => {
    const fileContent = JSON.stringify(content, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });

    const metadata: any = {
        mimeType: 'application/json',
    };
    if (description) {
        metadata.description = description;
    }
    // unlock param is ignored in file-based locking

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s Timeout

        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return await response.json();
    } catch (err) {
        console.error("Error updating file", err);
        throw err;
    }
};

export const deleteFile = async (fileId: string): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).drive.files.delete({
            fileId: fileId,
        });
        console.log(`File ${fileId} deleted successfully`);
    } catch (err: any) {
        // Ignore 404 (File not found), treat as success (idempotent)
        if (err?.result?.error?.code === 404 || err?.status === 404) {
            console.log(`File ${fileId} already deleted (404).`);
            return;
        }
        console.error("Error deleting file", err);
        throw err;
    }
};

export const getUserProfile = async () => {
    try {
        const accessToken = gapi.client.getToken()?.access_token;
        if (!accessToken) return null;

        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (response.ok) {
            return await response.json();
        }

        if (response.status === 401) {
            console.warn("User profile fetch returned 401 Unauthorized.");
            return null;
        }

        console.error(`User profile fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch user profile: ${response.status}`);
    } catch (error) {
        console.error("Error fetching user profile", error);
        // If it's a network error, we might want to throw to distinguish from "not signed in"
        // But for now, returning null/throwing lets the caller decide.
        // Current caller (initGoogleClient) treats reject as failure -> logout.
        throw error;
    }
};

export const uploadImage = async (file: File): Promise<string> => {
    const metadata = {
        name: file.name,
        parents: [CONFIG.DRIVE_ZS_FOLDER_ID],
        mimeType: file.type,
    };

    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) throw new Error("No access token");

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
        });
        const result = await response.json();
        if (result.id) {
            return result.id;
        }
        throw new Error("Upload failed, no ID returned");
    } catch (err) {
        console.error("Error uploading image", err);
        throw err;
    }
};

export const uploadVideo = async (file: Blob, filename: string): Promise<string> => {
    // Reusing ZS folder for now, or we could define a new constant
    const metadata = {
        name: filename,
        parents: [CONFIG.DRIVE_ZS_FOLDER_ID],
        mimeType: file.type || 'video/webm', // Fallback or strict?
    };

    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) throw new Error("No access token");

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
        });
        const result = await response.json();
        if (result.id) {
            return result.id;
        }
        throw new Error("Video upload failed, no ID returned");
    } catch (err) {
        console.error("Error uploading video", err);
        throw err;
    }
};

export const getPhotoUrl = (fileIdOrUrl: string | null): string | null => {
    if (!fileIdOrUrl) return null;
    if (fileIdOrUrl.startsWith('http') || fileIdOrUrl.startsWith('data:')) {
        return fileIdOrUrl;
    }
    return `https://drive.google.com/thumbnail?id=${fileIdOrUrl}&sz=w1000`;
};

// --- Locking Mechanism (File Based) ---

export interface LockInfo {
    lockedBy: string | null;
    lockedAt: number;
    lockId: string; // The ID of the lock file
}

const getLockFile = async (targetFileId: string): Promise<{ id: string, content: LockInfo } | null> => {
    try {
        const lockFileName = `lock_${targetFileId}.json`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = '${lockFileName}'`,
            fields: 'files(id, name, createdTime)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            const lockFile = files[0];
            const content = await getFileContent(lockFile.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = content as any;
            return {
                id: lockFile.id,
                content: {
                    lockedBy: meta?.lockedBy || null,
                    lockedAt: meta?.lockedAt || 0,
                    lockId: lockFile.id
                }
            };
        }
        return null;
    } catch (err) {
        console.error("Error checking lock", err);
        return null;
    }
};

export const ensureLockFile = async (targetFileId: string): Promise<string> => {
    const existing = await getLockFile(targetFileId);
    if (existing) return existing.id;

    // Create Initial
    const lockData: Partial<LockInfo> = {
        lockedBy: null,
        lockedAt: 0,
    };
    const lockFileName = `lock_${targetFileId}.json`;
    const saved = await saveTreeFile(lockFileName, lockData, "Lock File");
    return saved.id;
};

export const checkLock = async (targetFileId: string): Promise<LockInfo | null> => {
    const existing = await getLockFile(targetFileId);
    if (existing && existing.content.lockedBy) {
        return existing.content;
    }
    return null;
};

export const acquireLock = async (targetFileId: string): Promise<string | null> => {
    let lockFileId: string;
    try {
        lockFileId = await ensureLockFile(targetFileId);
    } catch (e) {
        console.error("Failed to ensure lock file", e);
        return null;
    }

    // Read latest
    try {
        const content = await getFileContent(lockFileId) as LockInfo;
        const now = Date.now();

        if (content.lockedBy) {
            // Check staleness (10 mins)
            if (now - (content.lockedAt || 0) < 10 * 60 * 1000) {
                console.log(`System locked by ${content.lockedBy}`);
                return null;
            }
            console.warn("Lock is stale > 10m. Stealing lock...");
        }

        const user = await getUserProfile();
        const newLockState: Partial<LockInfo> = {
            lockedBy: user?.email || 'Unknown',
            lockedAt: now,
            lockId: lockFileId // purely metadata
        };

        await updateTreeFile(lockFileId, newLockState, "Acquired Lock");
        return lockFileId;

    } catch (err) {
        console.error("Failed to acquire lock update", err);
        return null;
    }
};

export const releaseLock = async (lockFileId: string): Promise<void> => {
    try {
        const emptyState: Partial<LockInfo> = {
            lockedBy: null,
            lockedAt: 0
        };
        await updateTreeFile(lockFileId, emptyState, "Released Lock");
        console.log("Lock released (cleared).");
    } catch (err) {
        console.error("Error releasing lock", err);
    }
};

export const grantLockFilePermission = async (treeId: string, email: string) => {
    try {
        const lockId = await ensureLockFile(treeId);
        await grantWritePermission(lockId, email);
    } catch (e) {
        console.error("Failed to grant lock file permission", e);
    }
};

export const grantWritePermission = async (fileId: string, email: string) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).drive.permissions.create({
            fileId: fileId,
            resource: {
                role: 'writer',
                type: 'user',
                emailAddress: email
            },
            sendNotificationEmail: false
        });
        console.log(`Granted write permission to ${email}`);
    } catch (err) {
        console.error(`Failed to grant permission to ${email}`, err);
    }
};

/**
 * PHASE 1: Sheets-based Logging
 * Optimized for performance using O(1) appends.
 */

let cachedLogSpreadsheetId: string | null = null;

export const getOrCreateSharedLogSheet = async (): Promise<string | null> => {
    if (cachedLogSpreadsheetId) return cachedLogSpreadsheetId;

    const folderId = CONFIG.DRIVE_LOGS_FOLDER_ID;
    const fileName = CONFIG.DRIVE_LOGS_SPREADSHEET_NAME;

    try {
        // 1. Search for existing spreadsheet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${folderId}' in parents and trashed = false and name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet'`,
            fields: 'files(id, name)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            cachedLogSpreadsheetId = files[0].id;
            console.log("Found existing shared log spreadsheet:", cachedLogSpreadsheetId);
            return cachedLogSpreadsheetId;
        }

        // 2. Create if not found
        console.log("Creating new shared log spreadsheet...");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createRes = await (gapi.client as any).drive.files.create({
            resource: {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/vnd.google-apps.spreadsheet',
            },
            fields: 'id',
        });

        const spreadsheetId = createRes.result.id;

        // 3. Initialize headers
        // Headers: Timestamp, Email, Type, Text, Data (as JSON string)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: 'Sheet1!A1:E1',
            valueInputOption: 'RAW',
            resource: {
                values: [['Timestamp', 'Email', 'Type', 'Text', 'Data']]
            }
        });

        cachedLogSpreadsheetId = spreadsheetId;
        console.log("Shared log spreadsheet created and initialized:", spreadsheetId);
        return spreadsheetId;

    } catch (err) {
        console.error("Error in getOrCreateSharedLogSheet", err);
        return null;
    }
};

export const appendGeminiLogToSheets = async (email: string, logEntries: { type: string, text: string, data?: any, timestamp: Date }[]): Promise<void> => {
    try {
        const spreadsheetId = await getOrCreateSharedLogSheet();
        if (!spreadsheetId) return;

        const rows = logEntries.map(entry => [
            entry.timestamp.toISOString(),
            email,
            entry.type,
            entry.text,
            entry.data ? JSON.stringify(entry.data) : ''
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: 'Sheet1!A:E',
            valueInputOption: 'RAW',
            resource: {
                values: rows
            }
        });

        console.log(`Appended ${logEntries.length} log entries to Sheets.`);
    } catch (err: any) {
        console.error("Error appending Gemini log to Sheets", err);
        if (err?.status === 403 || err?.result?.error?.code === 403) {
            console.error("PERMISSION ERROR (403): This likely means the 'Sheets' scope is missing or the API is disabled.");
            console.log("Forcing sign-out to refresh scopes on next login.");
            // We can't easily trigger a re-auth from here without circular dependencies or complex state, 
            // but we can at least clear the token so the next reload forces sign-in.
            // signOut() handles everything including reload.
            signOut();
        }
    }
};

/**
 * PHASE 2: Tree Data in Sheets
 * Two-Sheet Architecture: Nodes and Relationships
 */

let cachedTreeSpreadsheetId: string | null = null;

const TREE_NODE_HEADERS = ['ID', 'Name', 'Gender', 'DOB', 'DOD', 'Email', 'Phone', 'District', 'State', 'Country', 'OccupationRole', 'OccupationOrg', 'Education', 'Hobbies', 'ImageUrl', 'Address', 'Notes', 'NameTranslations', 'LastUpdated'];
const TREE_RELATION_HEADERS = ['FromID', 'ToID', 'Type', 'Timestamp', 'FromName', 'ToName'];
const TREE_METADATA_HEADERS = ['Key', 'Value'];

export const getOrCreateTreeSpreadsheet = async (): Promise<string | null> => {
    if (cachedTreeSpreadsheetId) return cachedTreeSpreadsheetId;

    const folderId = CONFIG.DRIVE_TREE_FOLDER_ID;
    const fileName = CONFIG.DRIVE_TREE_SPREADSHEET_NAME;

    try {
        // 1. Search for existing spreadsheet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${folderId}' in parents and trashed = false and name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet'`,
            fields: 'files(id, name)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            cachedTreeSpreadsheetId = files[0].id;
            console.log("Found existing tree spreadsheet:", cachedTreeSpreadsheetId);
            return cachedTreeSpreadsheetId;
        }

        // 2. Create spreadsheet
        console.log("Creating new tree spreadsheet...");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createRes = await (gapi.client as any).sheets.spreadsheets.create({
            resource: {
                properties: { title: fileName },
                sheets: [
                    { properties: { title: 'Nodes' } },
                    { properties: { title: 'Relationships' } },
                    { properties: { title: 'Metadata' } }
                ]
            }
        });

        const spreadsheetId = createRes.result.spreadsheetId;

        // Move to the correct folder
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).drive.files.update({
            fileId: spreadsheetId,
            addParents: folderId,
            removeParents: 'root', // Google Sheets are created in root by default via Sheets API
            fields: 'id, parents',
        });

        // 3. Initialize Headers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                data: [
                    { range: 'Nodes!A1:S1', values: [TREE_NODE_HEADERS] },
                    { range: 'Relationships!A1:F1', values: [TREE_RELATION_HEADERS] },
                    { range: 'Metadata!A1:B1', values: [TREE_METADATA_HEADERS] }
                ],
                valueInputOption: 'RAW'
            }
        });

        cachedTreeSpreadsheetId = spreadsheetId;
        console.log("Tree spreadsheet created and initialized:", spreadsheetId);
        return spreadsheetId;

    } catch (err) {
        console.error("Error in getOrCreateTreeSpreadsheet", err);
        return null;
    }
};

/**
 * Migration helper to push existing JSON tree to Sheets
 */
export const migrateTreeToSheets = async (tree: TreeDocument): Promise<boolean> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return false;

        const nodes = Object.values(tree.nodes);
        console.log(`Migrating ${nodes.length} nodes to Sheets...`);

        // Prepare Node Rows
        const nodeRows = nodes.map(n => [
            n.nodeId,
            n.name,
            n.gender || '',
            n.dob || '',
            n.dod || '',
            n.email || '',
            n.phone || '',
            n.location?.district || '',
            n.location?.state || '',
            n.location?.country || '',
            n.occupation?.role || '',
            n.occupation?.organization || '',
            JSON.stringify(n.education || []),
            JSON.stringify(n.hobbies || []),
            n.imageUrl || '',
            n.address?.freeform || '',
            n.notes || '',
            JSON.stringify(n.nameTranslations || {}),
            new Date().toISOString()
        ]);

        // Prepare Relationship Rows
        const relRows: any[][] = [];
        nodes.forEach(n => {
            const fromName = n.name || 'Unknown';
            // Parent links
            if (n.parentId) {
                const toNode = tree.nodes[n.parentId];
                const toName = toNode?.name || 'Unknown';
                relRows.push([n.parentId, n.nodeId, 'parent', new Date().toISOString(), toName, fromName]);
            }
            // Spouse links
            if (n.spouseIds) {
                n.spouseIds.forEach((sid: string) => {
                    const toNode = tree.nodes[sid];
                    const toName = toNode?.name || 'Unknown';
                    // We only add one direction to keep sheet clean, or both for manual read?
                    // Let's add the direction from this node to spouse.
                    relRows.push([n.nodeId, sid, 'spouse', new Date().toISOString(), fromName, toName]);
                });
            }
        });

        // Prepare Metadata
        const metadataMap: Record<string, string> = {
            'treeId': tree.treeId,
            'treeName': tree.treeName,
            'rootNodeId': tree.rootNodeId,
            'schemaVersion': String(tree.schemaVersion),
            'versionIndex': String(tree.versionIndex),
            'timestamp': tree.timestamp,
            'createdBy': tree.meta.createdBy,
            'createdTime': tree.meta.createdTime
        };

        // Batch update
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                data: [
                    { range: 'Nodes!A2:S', values: nodeRows },
                    { range: 'Relationships!A2:F', values: relRows }
                ],
                valueInputOption: 'RAW'
            }
        });

        // Save Metadata separately (reusing the new helper)
        await saveMetadataToSheets(metadataMap);

        console.log("Migration to Sheets complete.");
        return true;
    } catch (err) {
        console.error("Migration to Sheets failed", err);
        return false;
    }
};

export const saveNodeToSheets = async (node: Partial<PersonNode> & { nodeId: string }): Promise<void> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return;

        // 1. Find if row exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Nodes!A:A', // Just ID column
        });

        const rows = response.result.values || [];
        const rowIndex = rows.findIndex((r: string[]) => r[0] === node.nodeId);

        const rowData = [
            node.nodeId,
            node.name || '',
            node.gender || '',
            node.dob || '',
            node.dod || '',
            node.email || '',
            node.phone || '',
            node.location?.district || '',
            node.location?.state || '',
            node.location?.country || '',
            node.occupation?.role || '',
            node.occupation?.organization || '',
            JSON.stringify(node.education || []),
            JSON.stringify(node.hobbies || []),
            node.imageUrl || '',
            node.address?.freeform || '',
            node.notes || '',
            JSON.stringify(node.nameTranslations || {}),
            new Date().toISOString()
        ];

        if (rowIndex !== -1) {
            // Update existing row (index + 1 because Sheets is 1-indexed)
            const range = `Nodes!A${rowIndex + 1}:S${rowIndex + 1}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (gapi.client as any).sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: [rowData] }
            });
            console.log(`Updated node ${node.nodeId} in Sheets.`);
        } else {
            // Append new row
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (gapi.client as any).sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: 'Nodes!A:S',
                valueInputOption: 'RAW',
                resource: { values: [rowData] }
            });
            console.log(`Appended node ${node.nodeId} to Sheets.`);
        }
    } catch (err) {
        console.error("Error saving node to Sheets", err);
    }
};

/**
 * Batch save multiple nodes to Sheets efficiently
 */
export const saveNodesBatchToSheets = async (nodes: PersonNode[]): Promise<void> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return;

        // 1. Get current IDs to find positions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Nodes!A:A',
        });

        const currentRows = response.result.values || [];
        const idToRowIndex = new Map<string, number>();
        currentRows.forEach((row: string[], index: number) => {
            if (row[0]) idToRowIndex.set(row[0], index);
        });

        const updates: { range: string; values: any[][] }[] = [];
        const appends: any[][] = [];

        nodes.forEach(node => {
            const rowData = [
                node.nodeId,
                node.name || '',
                node.gender || '',
                node.dob || '',
                node.dod || '',
                node.email || '',
                node.phone || '',
                node.location?.district || '',
                node.location?.state || '',
                node.location?.country || '',
                node.occupation?.role || '',
                node.occupation?.organization || '',
                JSON.stringify(node.education || []),
                JSON.stringify(node.hobbies || []),
                node.imageUrl || '',
                node.address?.freeform || '',
                node.notes || '',
                JSON.stringify(node.nameTranslations || {}),
                new Date().toISOString()
            ];

            const rowIndex = idToRowIndex.get(node.nodeId);
            if (rowIndex !== undefined && rowIndex !== -1) {
                // Sheets is 1-indexed
                updates.push({
                    range: `Nodes!A${rowIndex + 1}:S${rowIndex + 1}`,
                    values: [rowData]
                });
            } else {
                appends.push(rowData);
            }
        });

        // 2. Perform updates
        if (updates.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (gapi.client as any).sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    data: updates,
                    valueInputOption: 'RAW'
                }
            });
            console.log(`Batch updated ${updates.length} nodes in Sheets.`);
        }

        // 3. Perform appends
        if (appends.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (gapi.client as any).sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: 'Nodes!A:S',
                valueInputOption: 'RAW',
                resource: { values: appends }
            });
            console.log(`Batch appended ${appends.length} nodes to Sheets.`);
        }
    } catch (err) {
        console.error("Error in saveNodesBatchToSheets", err);
    }
};

export const saveMetadataToSheets = async (metadata: Record<string, string>): Promise<void> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return;

        const rows = Object.entries(metadata).map(([key, value]) => [key, value]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: 'Metadata!A2:B',
            valueInputOption: 'RAW',
            resource: { values: rows }
        });
        console.log("Updated tree metadata in Sheets.");
    } catch (err) {
        console.error("Error saving metadata to Sheets", err);
    }
};

export const saveRelationToSheets = async (fromId: string, toId: string, type: 'parent' | 'spouse', fromName: string = '', toName: string = ''): Promise<void> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return;

        const rowData = [fromId, toId, type, new Date().toISOString(), fromName, toName];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: 'Relationships!A:F',
            valueInputOption: 'RAW',
            resource: { values: [rowData] }
        });

        console.log(`Saved ${type} relation: ${fromId} -> ${toId} to Sheets.`);
    } catch (err) {
        console.error("Error saving relation to Sheets", err);
    }
};

export const loadTreeFromSheets = async (): Promise<{ nodes: PersonNode[], metadata: Record<string, string> }> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return { nodes: [], metadata: {} };

        console.log("Loading tree from Sheets...");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).sheets.spreadsheets.values.batchGet({
            spreadsheetId: spreadsheetId,
            ranges: ['Nodes!A2:S', 'Relationships!A2:F', 'Metadata!A2:B'],
        });

        const nodeData = response.result.valueRanges[0].values || [];
        const relData = response.result.valueRanges[1].values || [];
        const metaData = response.result.valueRanges[2].values || [];

        // Parsing Metadata
        const metadata: Record<string, string> = {};
        metaData.forEach((row: any[]) => {
            if (row[0]) metadata[row[0]] = row[1] || '';
        });

        // 2. Parse Nodes
        const nodes: PersonNode[] = nodeData.map((row: any[]) => ({
            nodeId: row[0],
            name: row[1],
            gender: row[2] as 'male' | 'female' | 'other' || null,
            dob: row[3] || null,
            dod: row[4] || null,
            email: row[5] || null,
            phone: row[6] || null,
            location: (row[7] || row[8] || row[9]) ? {
                district: row[7] || null,
                state: row[8] || null,
                country: row[9] || null,
                zipcode: null
            } : null,
            occupation: (row[10] || row[11]) ? {
                role: row[10] || '',
                organization: row[11] || ''
            } : null,
            education: row[12] ? JSON.parse(row[12]) : [],
            hobbies: row[13] ? JSON.parse(row[13]) : [],
            imageUrl: row[14] || null,
            address: row[15] || null,
            notes: row[16] || null,
            nameTranslations: row[17] ? JSON.parse(row[17]) : {},
            spouseIds: [], // To be filled from Relationships
            childrenIds: [], // To be filled from Relationships
            parentId: null // To be filled from Relationships
        }));

        const nodeMap = new Map<string, PersonNode>();
        nodes.forEach(n => nodeMap.set(n.nodeId, n));

        // 3. Apply Relationships
        relData.forEach((row: any[]) => {
            const fromId = row[0];
            const toId = row[1];
            const type = row[2];

            const fromNode = nodeMap.get(fromId);
            const toNode = nodeMap.get(toId);

            if (type === 'parent' && toNode) {
                toNode.parentId = fromId;
                if (fromNode && !fromNode.childrenIds.includes(toId)) {
                    fromNode.childrenIds.push(toId);
                }
            } else if (type === 'spouse') {
                if (fromNode && !fromNode.spouseIds.includes(toId)) {
                    fromNode.spouseIds.push(toId);
                }
                if (toNode && !toNode.spouseIds.includes(fromId)) {
                    toNode.spouseIds.push(fromId);
                }
            }
        });

        console.log(`Loaded ${nodes.length} nodes, ${relData.length} relationships, and ${Object.keys(metadata).length} meta entries from Sheets.`);
        return { nodes, metadata };

    } catch (err) {
        console.error("Error loading tree from Sheets", err);
        return { nodes: [], metadata: {} };
    }
};

/**
 * Search nodes directly in Sheets (bypassing GlobalTreeService cache)
 */
export const searchNodesInSheets = async (query: string): Promise<PersonNode[]> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return [];

        const lowerQuery = query.toLowerCase();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Nodes!A2:S',
        });

        const rows = response.result.values || [];
        const matches: PersonNode[] = [];

        for (const row of rows) {
            const name = row[1] || '';
            const email = row[5] || '';
            const translations = row[17] ? JSON.parse(row[17]) : {};
            const transValues = Object.values(translations).join(' ').toLowerCase();

            if (name.toLowerCase().includes(lowerQuery) ||
                email.toLowerCase().includes(lowerQuery) ||
                transValues.includes(lowerQuery)) {

                // Construct basic node info enough for linking
                matches.push({
                    nodeId: row[0],
                    name: row[1],
                    gender: row[2] as 'male' | 'female' | 'other' || null,
                    dob: row[3] || null,
                    email: row[4] || null,
                    phone: row[5] || null,
                    imageUrl: null, phoneE164: null, dobApprox: { known: false, year: null, month: null, day: null },
                    dod: null, dodApprox: { known: false, year: null, month: null, day: null },
                    address: { freeform: null },
                    spouseIds: [], childrenIds: [], parentId: null,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as unknown as PersonNode);
            }
        }
        return matches;
    } catch (err) {
        console.error("Error searching nodes in Sheets", err);
        return [];
    }
};

/**
 * Get the N most recently updated nodes from Sheets
 */
export const getRecentNodesFromSheets = async (limit: number = 10): Promise<PersonNode[]> => {
    try {
        const spreadsheetId = await getOrCreateTreeSpreadsheet();
        if (!spreadsheetId) return [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Nodes!A2:S',
        });

        const rows = response.result.values || [];
        // Sort by LastUpdated (Column S / Index 18) descending
        const sorted = rows.sort((a: any, b: any) => {
            const dateA = new Date(a[18] || 0).getTime();
            const dateB = new Date(b[18] || 0).getTime();
            return dateB - dateA;
        });

        return sorted.slice(0, limit).map((row: any) => ({
            nodeId: row[0],
            name: row[1],
            gender: row[2] as 'male' | 'female' | 'other' || null,
            dob: row[3] || null,
            email: row[4] || null,
            phone: row[5] || null,
            imageUrl: null, phoneE164: null, dobApprox: { known: false, year: null, month: null, day: null },
            dod: null, dodApprox: { known: false, year: null, month: null, day: null },
            address: { freeform: null },
            spouseIds: [], childrenIds: [], parentId: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as unknown as PersonNode));
    } catch (err) {
        console.error("Error getting recent nodes from Sheets", err);
        return [];
    }
};

