import { useCallback } from 'react';
import type { TreeDocument } from '../../logic/types';
import { listTreeFiles, acquireLock, checkLock, releaseLock, signOut } from '../../services/drive';
import { getTreeNameFromFilename } from '../../logic/fileUtils';

interface UseLockingProps {
    setLoading: (loading: boolean) => void;
    setLoadingMessage: (msg: string) => void;
    loadTree: (returnOnly?: boolean, specificFileId?: string) => Promise<TreeDocument | null>;
    currentTreeName: string;
    currentTreeId: string | null;
    setIsSignedIn: (signedIn: boolean) => void;
    setTree: (tree: TreeDocument | null) => void;
}

export const useLocking = ({
    setLoading,
    setLoadingMessage,
    loadTree,
    currentTreeName,
    currentTreeId,
    setIsSignedIn,
    setTree
}: UseLockingProps) => {

    const executeWithLock = useCallback(async (action: (latestTree: TreeDocument | null, lockId: string) => Promise<void>) => {
        setLoading(true);
        setLoadingMessage("Acquiring lock...");

        let lockId: string | null = null;
        let targetFileId: string | null = null;

        try {
            const files = await listTreeFiles();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileslist = files as any[];

            if (fileslist && fileslist.length > 0) {
                if (currentTreeName) {
                    const matching = fileslist.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
                    if (matching.length > 0) {
                        targetFileId = matching[0].id;
                    } else if (currentTreeId) {
                        const currentFile = fileslist.find((f: any) => f.id === currentTreeId);
                        targetFileId = currentFile ? currentFile.id : fileslist[0].id;
                    } else {
                        targetFileId = fileslist[0].id;
                    }
                } else {
                    targetFileId = fileslist[0].id;
                }
            } else {
                await action(null, "");
                setLoading(false);
                setLoadingMessage("Loading...");
                return;
            }

            if (!targetFileId) return;

            lockId = await acquireLock(targetFileId);

            while (!lockId) {
                const lockInfo = await checkLock(targetFileId);
                if (lockInfo) {
                    setLoadingMessage(`Waiting for lock release... (Locked by ${lockInfo.lockedBy})`);
                } else {
                    setLoadingMessage("Acquiring lock...");
                    lockId = await acquireLock(targetFileId);
                }

                if (!lockId) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            try {
                setLoadingMessage("Refreshing data...");
                const latestTree = await loadTree(true, targetFileId!);

                setLoadingMessage("Saving Nodes & Relations...");
                await action(latestTree, lockId);

                if (latestTree) {
                    setTree({ ...latestTree, nodes: { ...latestTree.nodes } } as TreeDocument);
                }
            } catch (e) {
                console.error("Error during locked operation", e);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const err = e as any;
                if (err?.status === 401 || err?.result?.error?.code === 401) {
                    alert("Session expired. Please sign in again.");
                    signOut();
                    setIsSignedIn(false);
                    return;
                }
                alert("An error occurred: " + err.message);
            } finally {
                if (lockId) {
                    setLoadingMessage("Releasing lock...");
                    await releaseLock(lockId);
                }
                setLoading(false);
                setLoadingMessage("Loading...");
            }
        } catch (err) {
            console.error("Top level error in executeWithLock", err);
            setLoading(false);
        }
    }, [setLoading, setLoadingMessage, loadTree, currentTreeName, currentTreeId, setIsSignedIn, setTree]);

    return { executeWithLock };
};
