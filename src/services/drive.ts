import { gapi } from 'gapi-script';
import { CONFIG } from '../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

let gapiInitedPromise: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let accessToken: string | null = null;

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
                // clientId and scope are now handled by GIS
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            }).then(() => {
                console.log("Client initialized (API Key), now loading Drive API...");
                return gapi.client.load('drive', 'v3');
            }).then(() => {
                console.log("Drive API loaded successfully.");

                // Initialize GIS Token Client
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.CLIENT_ID,
                    scope: CONFIG.SCOPES,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    callback: (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                            // Store token info for silent login
                            localStorage.setItem('gapi_token', tokenResponse.access_token);
                            if (tokenResponse.expires_in) {
                                const expiresInSec = Number(tokenResponse.expires_in);
                                const expiresAt = Date.now() + (expiresInSec * 1000);
                                localStorage.setItem('gapi_token_expires', expiresAt.toString());
                                console.log(`Token received. Expires in ${expiresInSec}s (at ${new Date(expiresAt).toLocaleTimeString()})`);
                            }
                            gapi.client.setToken(tokenResponse);
                            updateSigninStatus(true);
                        }
                    },
                });

                // Silent login: Check if we have a valid token stored
                const storedToken = localStorage.getItem('gapi_token');
                const tokenExpires = localStorage.getItem('gapi_token_expires');

                if (storedToken && tokenExpires) {
                    const expiresAt = parseInt(tokenExpires, 10);
                    const now = Date.now();
                    const timeLeft = (expiresAt - now) / 1000;

                    // Check if token is still valid (with 2-minute buffer)
                    if (expiresAt > now + (2 * 60 * 1000)) {
                        console.log(`Found stored token. Valid for ${timeLeft.toFixed(0)}s. Attempting silent sign-in...`);
                        accessToken = storedToken;
                        gapi.client.setToken({ access_token: storedToken });

                        // Verify token is actually valid by making a test API call
                        getUserProfile().then(profile => {
                            if (profile) {
                                console.log("Silent sign-in verified and successful!");
                                updateSigninStatus(true);
                            } else {
                                console.warn("Silent sign-in failed: User profile check returned null (likely 401). clearing...");
                                localStorage.removeItem('gapi_token');
                                localStorage.removeItem('gapi_token_expires');
                                updateSigninStatus(false);
                            }
                        }).catch((err) => {
                            console.error("Silent sign-in validation received error:", err);
                            // Only clear if it looks like an Auth error, otherwise keep it?
                            // Actually, if we can't verify, we can't trust it. Safest to clear.
                            localStorage.removeItem('gapi_token');
                            localStorage.removeItem('gapi_token_expires');
                            updateSigninStatus(false);
                        });
                    } else {
                        console.log(`Stored token has expired (or is about to). Expired at ${new Date(expiresAt).toLocaleTimeString()}. Clearing...`);
                        localStorage.removeItem('gapi_token');
                        localStorage.removeItem('gapi_token_expires');
                        updateSigninStatus(false);
                    }
                } else {
                    console.log("No stored token found, user needs to sign in.");
                    updateSigninStatus(false);
                }

                resolve();
            }).catch((error: unknown) => {
                console.error("CRITICAL ERROR: Google Client Init or Drive API Load failed", error);
                if (error && typeof error === 'object' && 'result' in error) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    console.error("Error result:", (error as any).result);
                }
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

export const saveGeminiLog = async (email: string, logEntries: { type: string, text: string, data?: any, timestamp: Date }[], existingFileId: string | null = null): Promise<string | null> => {
    if (!email) return null;

    const fileName = `gemini_history_${email}.json`;
    const folderId = CONFIG.DRIVE_LOGS_FOLDER_ID;
    let fileId: string | null = existingFileId;

    try {
        // 1. Check if file exists in the specific folder if we don't have an ID
        if (!fileId) {
            console.log(`Searching for log file: ${fileName} in folder ${folderId}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (gapi.client as any).drive.files.list({
                q: `'${folderId}' in parents and trashed = false and name = '${fileName}'`,
                fields: 'files(id, name, createdTime)',
                orderBy: 'createdTime desc', // Sort by newest first
            });
            const files = response.result.files;

            console.log(`Found ${files ? files.length : 0} existing log files.`);

            if (files && files.length > 0) {
                fileId = files[0].id; // Use the newest file
                console.log(`Using existing log file: ${fileId} (Created: ${files[0].createdTime})`);
                if (files.length > 1) {
                    console.warn(`Duplicate log files found! Deleting ${files.length - 1} older copies.`);
                    // Delete duplicates (slice 1 to end)
                    for (let i = 1; i < files.length; i++) {
                        if (files[i]?.id) {
                            deleteFile(files[i].id).catch(e => console.error("Failed to delete duplicate log", e));
                        }
                    }
                }
            } else {
                console.log("No existing log file found. Creating new.");
            }
        }

        let currentContent: any[] = [];

        // 2. Read existing content
        try {
            if (fileId) {
                const content = await getFileContent(fileId);
                if (Array.isArray(content)) {
                    currentContent = content;
                }
            }
        } catch (readErr) {
            console.warn("Could not read existing log file, starting fresh.", readErr);
        }

        // 3. Prepend new entries (Newest at Top for user viewing)
        // Reverse the *new* batch so newest of the batch is first, then prepend to current.
        const reversedNewLogs = [...logEntries].reverse();
        const updatedContent = [...reversedNewLogs, ...currentContent];

        const fileContent = JSON.stringify(updatedContent, null, 2);
        const file = new Blob([fileContent], { type: 'application/json' });

        const metadata: any = {
            mimeType: 'application/json',
        };

        const accessToken = gapi.auth.getToken().access_token;
        const uploadForm = new FormData();
        uploadForm.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        uploadForm.append('file', file);

        if (fileId) {
            // Update
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: uploadForm,
            });
            return fileId;
        } else {
            // Create New
            metadata.name = fileName;
            metadata.parents = [folderId];
            const createForm = new FormData();
            createForm.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            createForm.append('file', file);

            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: createForm,
            });
            const data = await res.json();
            return data.id || null;
        }

    } catch (err) {
        console.error("Error saving Gemini log", err);
        return fileId;
    }
};

export const loadGeminiLog = async (email: string): Promise<{ id: string | null, content: any[] }> => {
    if (!email) return { id: null, content: [] };
    const fileName = `gemini_history_${email}.json`;
    const folderId = CONFIG.DRIVE_LOGS_FOLDER_ID;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${folderId}' in parents and trashed = false and name = '${fileName}'`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            const fileId = files[0].id;
            const content = await getFileContent(fileId);
            return { id: fileId, content: Array.isArray(content) ? content : [] };
        }
        return { id: null, content: [] };
    } catch (err) {
        console.error("Error loading Gemini log", err);
        return { id: null, content: [] };
    }
};
