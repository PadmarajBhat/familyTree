import { gapi } from 'gapi-script';
import { CONFIG } from '../config';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];

export const initGoogleClient = (updateSigninStatus: (isSignedIn: boolean) => void) => {
    gapi.load('client:auth2', () => {
        gapi.client.init({
            clientId: CONFIG.CLIENT_ID,
            apiKey: CONFIG.API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
            scope: CONFIG.SCOPES,
        }).then(() => {
            // Listen for sign-in state changes.
            gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
            // Handle the initial sign-in state.
            updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        }, (error: any) => {
            console.error("Error initializing Google Client", error);
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
