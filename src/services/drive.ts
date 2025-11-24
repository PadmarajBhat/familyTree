import { gapi } from 'gapi-script';
import { CONFIG } from '../config';

declare const google: any;

let gapiInitedPromise: Promise<void> | null = null;
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
                    callback: (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                            gapi.client.setToken(tokenResponse);
                            updateSigninStatus(true);
                        }
                    },
                });

                // Check if we have a valid token stored (optional, for persistent login)
                // For now, we start as signed out until user clicks Sign In
                updateSigninStatus(false);
                resolve();
            }).catch((error: any) => {
                console.error("CRITICAL ERROR: Google Client Init or Drive API Load failed", error);
                if (error.result) {
                    console.error("Error result:", error.result);
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
            // Update UI
            // We need a way to notify App.tsx. 
            // Since we don't have a listener, we might need to expose a callback setter or reload.
            // For simplicity, we'll reload the page or let the App component handle state if it passed a callback.
            // But initGoogleClient only takes one callback.
            // Let's assume the App component will handle the state change if we call the callback passed to init.
            // But we don't have access to it here easily without storing it.
            // Let's just reload for now to clear state, or we can store the callback.
            window.location.reload();
        });
    }
};

export const listTreeFiles = async () => {
    try {
        const response = await (gapi.client as any).drive.files.list({
            q: `'${CONFIG.DRIVE_TREE_FOLDER_ID}' in parents and trashed = false and name contains 'json'`,
            fields: 'nextPageToken, files(id, name, createdTime, modifiedTime)',
            orderBy: 'name desc', // Latest version first if naming convention holds, or modifiedTime desc
        });
        return response.result.files;
    } catch (err) {
        console.error("Error listing files", err);
        throw err;
    }
};

export const getFileContent = async (fileId: string) => {
    try {
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

export const saveTreeFile = async (name: string, content: any) => {
    const fileContent = JSON.stringify(content, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        name: name,
        parents: [CONFIG.DRIVE_TREE_FOLDER_ID],
        mimeType: 'application/json',
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
