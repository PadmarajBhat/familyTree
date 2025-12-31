
import { gapi } from 'gapi-script';

export const uploadImage = async (file: File): Promise<string> => {
    try {
        const metadata = { name: file.name, mimeType: file.type };
        const response = await (gapi.client as any).drive.files.create({
            resource: metadata,
            media: { mimeType: file.type, body: file }
        });
        return response.result.id;
    } catch (err) {
        console.error("Error uploading image", err);
        throw err;
    }
};

export const uploadVideo = async (file: Blob, filename: string): Promise<string> => {
    try {
        const metadata = { name: filename, mimeType: 'video/webm' };
        const response = await (gapi.client as any).drive.files.create({
            resource: metadata,
            media: { mimeType: 'video/webm', body: file }
        });
        return response.result.id;
    } catch (err) {
        console.error("Error uploading video", err);
        throw err;
    }
};

export const getPhotoUrl = (fileIdOrUrl: string | null): string | null => {
    if (!fileIdOrUrl) return null;
    if (fileIdOrUrl.startsWith('http')) return fileIdOrUrl;
    return `https://docs.google.com/uc?export=view\u0026id=${fileIdOrUrl}`;
};
