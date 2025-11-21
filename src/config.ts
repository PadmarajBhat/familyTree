export const CONFIG = {
    CLIENT_ID: '689013590063-1sp072ucu6dtui8g60c6qe7akane0858.apps.googleusercontent.com', // User must replace this
    API_KEY: 'YOUR_API_KEY_HERE', // Optional if using OAuth only, but needed for public read if not signed in?
    // Actually, for "Anyone with link", we might not need API Key if we just use the web link, 
    // but to use the Drive API to list/read, we need either Auth or API Key.
    // Since we want "Public View", an API Key is recommended for unauthenticated access to public files.

    DRIVE_TREE_FOLDER_ID: '1vd_aUxnvFFARNE6YFetiCAp7LV8LdT7-',
    DRIVE_ZS_FOLDER_ID: '1P5ZkHNj4U0C1g5WAyZIcO0eOa0m7hW4Y', // Profile Pics

    SCOPES: 'https://www.googleapis.com/auth/drive.file', // or 'https://www.googleapis.com/auth/drive'
    // 'drive.file' only allows access to files created by this app. 
    // If the user wants to edit existing files not created by this app (e.g. manually uploaded), we need 'drive'.
    // Given the requirement "The tree has to be save in google drive", 'drive.file' is safer but 'drive' is more flexible.
    // Let's stick to 'drive.file' if possible, but if we need to read the *existing* folder provided by user, we might need 'drive.readonly' or 'drive'.
    // The user provided a specific folder ID. We need to write into it.
    // So we likely need 'https://www.googleapis.com/auth/drive'.
};
