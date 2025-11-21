import { gapi } from 'gapi-script';
import { CONFIG } from '../config';



export const initGoogleClient = (updateSigninStatus: (isSignedIn: boolean) => void) => {
    gapi.load('client:auth2', () => {
        console.log("GAPI loaded, initializing client...");
        gapi.client.init({
            clientId: CONFIG.CLIENT_ID,
            apiKey: CONFIG.API_KEY,
            scope: CONFIG.SCOPES,
            // discoveryDocs: DISCOVERY_DOCS, // Removed to isolate 502 error
        }).then(() => {
            console.log("Client initialized (Auth), now loading Drive API...");
            return gapi.client.load('drive', 'v3');
        }).then(() => {
            console.log("Drive API loaded successfully. Setting up listeners.");
            // Listen for sign-in state changes.
            gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
            // Handle the initial sign-in state.
            updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        }).catch((error: any) => {
            console.error("CRITICAL ERROR: Google Client Init or Drive API Load failed", error);
            // Log full error details
            if (error.result) {
                console.error("Error result:", error.result);
            }
        });
    });
};

export const signIn = () => {
    gapi.auth2.getAuthInstance().signIn();
};

export const signOut = () => {
    gapi.auth2.getAuthInstance().signOut();
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
