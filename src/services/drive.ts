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
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name contains 'json'`,
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
