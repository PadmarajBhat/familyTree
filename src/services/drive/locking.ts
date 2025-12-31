
import { gapi } from 'gapi-script';
import { updateTreeFile } from './files';

export interface LockInfo {
    lockedBy: string | null;
    lockedAt: number;
    lockId: string;
}

export const getLockFile = async (targetFileId: string): Promise<{ id: string, content: LockInfo } | null> => {
    try {
        const response = await (gapi.client as any).drive.files.list({
            q: `name='lock_${targetFileId}.json' and trashed=false`,
            fields: 'files(id, name)'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            const fileId = files[0].id;
            const contentResponse = await (gapi.client as any).drive.files.get({ fileId: fileId, alt: 'media' });
            return { id: fileId, content: contentResponse.result };
        }
    } catch (err) {
        console.error("Error getting lock file", err);
    }
    return null;
};

export const ensureLockFile = async (targetFileId: string): Promise<string> => {
    const existing = await getLockFile(targetFileId);
    if (existing) return existing.id;
    const initialContent: LockInfo = { lockedBy: null, lockedAt: 0, lockId: targetFileId };
    const response = await (gapi.client as any).drive.files.create({
        resource: { name: `lock_${targetFileId}.json`, mimeType: 'application/json' },
        media: { mimeType: 'application/json', body: JSON.stringify(initialContent) }
    });
    return response.result.id;
};

export const checkLock = async (targetFileId: string): Promise<LockInfo | null> => {
    const lock = await getLockFile(targetFileId);
    return lock ? lock.content : null;
};

export const acquireLock = async (targetFileId: string): Promise<string | null> => {
    try {
        const lockFileId = await ensureLockFile(targetFileId);
        const lock = await getLockFile(targetFileId);
        if (!lock) return null;

        const now = Date.now();
        if (lock.content.lockedBy && (now - lock.content.lockedAt < 30000)) return null;

        const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }
        });
        const user = await userResponse.json();
        const newState: LockInfo = { lockedBy: user.email, lockedAt: now, lockId: targetFileId };

        await updateTreeFile(lockFileId, newState, "Acquired Lock");
        return lockFileId;
    } catch (err) {
        console.error("Failed to acquire lock", err);
        return null;
    }
};

export const releaseLock = async (lockFileId: string): Promise<void> => {
    try {
        const emptyState: Partial<LockInfo> = { lockedBy: null, lockedAt: 0 };
        await updateTreeFile(lockFileId, emptyState, "Released Lock");
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
        await (gapi.client as any).drive.permissions.create({
            fileId: fileId,
            resource: { role: 'writer', type: 'user', emailAddress: email },
            sendNotificationEmail: false
        });
    } catch (err) {
        console.error("Error granting permission", err);
    }
};
