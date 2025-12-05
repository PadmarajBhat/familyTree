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
                                const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
                                localStorage.setItem('gapi_token_expires', expiresAt.toString());
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

                    // Check if token is still valid (with 5-minute buffer)
                    if (expiresAt > now + (5 * 60 * 1000)) {
                        console.log("Found valid stored token, attempting silent sign-in...");
                        accessToken = storedToken;
                        gapi.client.setToken({ access_token: storedToken });

                        // Verify token is actually valid by making a test API call
                        getUserProfile().then(profile => {
                            if (profile) {
                                console.log("Silent sign-in successful!");
                                updateSigninStatus(true);
                            } else {
                                console.log("Stored token is invalid, clearing...");
                                localStorage.removeItem('gapi_token');
                                localStorage.removeItem('gapi_token_expires');
                                updateSigninStatus(false);
                            }
                        }).catch(() => {
                            console.log("Token validation failed, clearing...");
                            localStorage.removeItem('gapi_token');
                            localStorage.removeItem('gapi_token_expires');
                            updateSigninStatus(false);
                        });
                    } else {
                        console.log("Stored token has expired, clearing...");
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
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name contains 'json' and name != 'preferences.json'`,
            fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, description)',
            orderBy: 'createdTime desc', // Load latest created file
        });
        return response.result.files;
    } catch (err) {
        console.error("Error listing files", err);
        throw err;
    }
};

export interface UserPreferences {
    [email: string]: {
        defaultTreeName?: string;
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
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
        });
        return await response.json();
    } catch (err) {
        console.error("Error saving file", err);
        throw err;
    }
};

// Updated updateTreeFile to support atomic unlock
export const updateTreeFile = async (fileId: string, content: unknown, description?: string, unlock: boolean = false) => {
    const fileContent = JSON.stringify(content, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });

    const metadata: any = {
        mimeType: 'application/json',
    };
    if (description) {
        metadata.description = description;
    }

    if (unlock) {
        metadata.contentRestrictions = [{
            readOnly: false
        }];
    }

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form,
        });
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
    } catch (err) {
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
        return null;
    } catch (error) {
        console.error("Error fetching user profile", error);
        return null;
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

export const getPhotoUrl = (fileIdOrUrl: string | null): string | null => {
    if (!fileIdOrUrl) return null;
    if (fileIdOrUrl.startsWith('http') || fileIdOrUrl.startsWith('data:')) {
        return fileIdOrUrl;
    }
    return `https://drive.google.com/thumbnail?id=${fileIdOrUrl}&sz=w1000`;
};

// --- Locking Mechanism (ContentRestrictions) ---

export interface LockInfo {
    lockedBy: string;
    lockedAt: number; // API doesn't give exact time easily in list, but we can put it in reason string or just rely on API
    lockId: string; // The File ID itself acts as the lock reference
}

export const checkLock = async (fileId: string): Promise<LockInfo | null> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.get({
            fileId: fileId,
            fields: 'contentRestrictions',
        });

        const restrictions = response.result.contentRestrictions;
        if (restrictions && restrictions.length > 0 && restrictions[0].readOnly) {
            const user = restrictions[0].restrictingUser;
            // The API might return restrictedTime in ISO string
            const lockedTime = restrictions[0].restrictionTime ? new Date(restrictions[0].restrictionTime).getTime() : Date.now();

            return {
                lockedBy: user?.emailAddress || 'Unknown',
                lockedAt: lockedTime,
                lockId: fileId
            };
        }
        return null;
    } catch (err) {
        console.error("Error checking lock", err);
        return null; // Assume no lock or error
    }
};

export const acquireLock = async (fileId: string): Promise<string | null> => {
    // 1. Try to add content restriction
    try {
        const user = await getUserProfile();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).drive.files.update({
            fileId: fileId,
            resource: {
                contentRestrictions: [{
                    readOnly: true,
                    reason: `Locked by ${user?.email || 'User'} for editing`
                }]
            }
        });
        return fileId;
    } catch (err) {
        console.error("Failed to acquire lock (likely already locked)", err);
        return null;
    }
};

export const releaseLock = async (fileId: string): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (gapi.client as any).drive.files.update({
            fileId: fileId,
            resource: {
                contentRestrictions: [{
                    readOnly: false
                }]
            }
        });
        console.log("Lock released.");
    } catch (err) {
        console.error("Error releasing lock", err);
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
        // It might fail if already exists, which is fine
    }
};
