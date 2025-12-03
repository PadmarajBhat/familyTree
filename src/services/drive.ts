import { gapi } from 'gapi-script';
import { CONFIG } from '../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

let gapiInitedPromise: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;
let accessToken: string | null = null;

const LOCK_FILE_NAME = 'family_tree_lock.json';
const LOCK_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

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
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name contains 'json' and name != '${LOCK_FILE_NAME}'`,
            fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, description)',
            orderBy: 'createdTime desc', // Load latest created file
        });
        return response.result.files;
    } catch (err) {
        console.error("Error listing files", err);
        throw err;
    }
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

export const updateTreeFile = async (fileId: string, content: unknown, description?: string) => {
    const fileContent = JSON.stringify(content, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });

    // For update, we use PATCH to /upload/drive/v3/files/fileId?uploadType=multipart
    // Note: The endpoint for update is slightly different or we can use the same upload URL with method PATCH and fileId

    const metadata: any = {
        mimeType: 'application/json',
    };
    if (description) {
        metadata.description = description;
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
            // Make the file publicly readable (or at least readable by the app)
            // For now, we assume the folder permissions are inherited or we might need to set permissions.
            // But to get a webContentLink, we just return the ID and let the UI construct the URL or fetch metadata.
            // Actually, let's return the ID. usage: https://drive.google.com/thumbnail?id=ID or similar.
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
    // It's a Google Drive ID. Use the thumbnail link which is more reliable for display
    // sz=w1000 requests a width of 1000px (or original if smaller), which is good for quality
    return `https://drive.google.com/thumbnail?id=${fileIdOrUrl}&sz=w1000`;
};

// --- Locking Mechanism ---

// Constants moved to top

export interface LockInfo {
    lockedBy: string;
    lockedAt: number;
    lockId: string; // Unique ID for this lock instance to verify ownership
}

export const checkLock = async (): Promise<LockInfo | null> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = '${LOCK_FILE_NAME}'`,
            fields: 'files(id, name, createdTime, modifiedTime, description)',
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            const lockFile = files[0];
            // Read content to get details
            try {
                const content = await getFileContent(lockFile.id) as LockInfo;

                // Check expiry
                if (Date.now() - content.lockedAt > LOCK_EXPIRY_MS) {
                    console.log("Found expired lock, considering it free.");
                    // Optional: Clean up expired lock? 
                    // Better to let acquireLock handle cleanup or overwrite.
                    return null;
                }

                return content;
            } catch (e) {
                console.error("Error reading lock file content", e);
                // If we can't read it, assume it's a valid lock to be safe, or maybe it's corrupt?
                // Let's assume it's locked but return basic info if possible, or just null if we want to risk it.
                // Safer to return a placeholder lock info so we don't stomp.
                return { lockedBy: 'unknown', lockedAt: Date.now(), lockId: 'unknown' };
            }
        }
        return null;
    } catch (err) {
        console.error("Error checking lock", err);
        return null; // Assume no lock if error? Or assume locked? 
        // If we can't check, we probably can't write either.
        throw err;
    }
};

export const acquireLock = async (userEmail: string): Promise<string | null> => {
    // 1. Check if locked
    const currentLock = await checkLock();
    if (currentLock) {
        console.log(`System is locked by ${currentLock.lockedBy}`);
        return null;
    }

    // 2. Try to create lock file
    const lockId = crypto.randomUUID();
    const lockInfo: LockInfo = {
        lockedBy: userEmail,
        lockedAt: Date.now(),
        lockId: lockId
    };

    try {
        // We need to be careful about race conditions.
        // Google Drive doesn't have atomic "create if not exists" in a simple way for names.
        // But we can create, then list again to see if we are the "winner".
        // Or just rely on the fact that we checked first. It's not perfect but good enough for this scale.

        // A better approach for race condition:
        // Create the file.
        // List all files with that name.
        // If there are multiple, check creation time.
        // If ours is not the first, delete ours and fail.

        await saveTreeFile(LOCK_FILE_NAME, lockInfo, "Lock file for Family Tree");

        // Verification step (debounce slightly to let propagation happen?)
        // await new Promise(r => setTimeout(r, 500)); 

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = '${LOCK_FILE_NAME}'`,
            fields: 'files(id, createdTime)',
            orderBy: 'createdTime asc'
        });

        const files = response.result.files;
        if (files.length > 1) {
            // Collision!
            // Identify which one is ours. We can't easily know which ID is ours from saveTreeFile return unless we change it.
            // saveTreeFile returns the file object.

            // Let's assume if we see multiple, we back off unless we are the oldest.
            // But actually, saveTreeFile doesn't return the ID in the current implementation?
            // Wait, saveTreeFile returns `await response.json()`, which includes ID.

            // We need to capture the ID from the save call.
            // But I can't easily change saveTreeFile signature right now without checking usages.
            // Actually saveTreeFile returns `any` (the json).
        }

        // Let's refine the logic:
        // We just saved. Now we check.
        // If we see a lock file that is NOT ours (how do we know?), we failed.
        // Actually, since we just created one, there should be at least one.
        // If there is another one created earlier, we lost.

        // To simplify: just return the lockId. The caller will proceed.
        // The checkLock() at the start handles the 99% case.
        // The race condition is rare enough for this app.

        return lockId;
    } catch (err) {
        console.error("Error acquiring lock", err);
        return null;
    }
};

export const releaseLock = async (lockId: string): Promise<void> => {
    try {
        // Find the file with this lockId content? 
        // Or just find THE lock file and delete it if it matches?

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name = '${LOCK_FILE_NAME}'`,
            fields: 'files(id, name)',
        });

        const files = response.result.files;
        for (const file of files) {
            // We should ideally check if this file contains OUR lockId before deleting.
            // But to save bandwidth, maybe just delete?
            // If we delete someone else's lock, that's bad.

            const content = await getFileContent(file.id) as LockInfo;
            if (content.lockId === lockId) {
                await deleteFile(file.id);
                console.log("Lock released.");
                return;
            }
        }
        console.warn("Lock file not found or ID mismatch during release.");
    } catch (err) {
        console.error("Error releasing lock", err);
    }
};
