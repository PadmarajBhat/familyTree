import {
    acquireLock,
    releaseLock,
    checkLock,
    getFileContent,
    updateTreeFile,
    saveTreeFile,
    renameFile,
    listTreeFiles
} from '../../services/drive';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { mergeTrees } from '../../logic/merge';
import { generateFilename, getTreeNameFromFilename } from '../../logic/fileUtils';
import type { TreeDocument } from '../../logic/types';

interface UseTreeStorageProps {
    currentTreeName: string;
    currentTreeId: string | null;
    setCurrentTreeId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    setLoadingMessage: (msg: string) => void;
    loadTree: (returnOnly?: boolean, specificFileId?: string) => Promise<TreeDocument | null>;
}

export function useTreeStorage({
    currentTreeName, currentTreeId, setCurrentTreeId,
    setLoading, setLoadingMessage, loadTree
}: UseTreeStorageProps) {

    const executeWithLock = async (action: (latestTree: TreeDocument | null, lockId: string) => Promise<void>) => {
        setLoading(true);
        setLoadingMessage("Acquiring lock...");
        let lockId: string | null = null;
        let targetFileId: string | null = null;

        try {
            const files = await listTreeFiles();
            if (files && files.length > 0) {
                if (currentTreeName) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const matching = files.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
                    targetFileId = matching.length > 0 ? matching[0].id : files[0].id;
                } else {
                    targetFileId = files[0].id;
                }
            } else {
                await action(null, "");
                setLoading(false);
                return;
            }

            if (!targetFileId) return;
            lockId = await acquireLock(targetFileId);

            while (!lockId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const lockInfo: any = await checkLock(targetFileId);
                if (lockInfo) setLoadingMessage(`Waiting for lock release... (Locked by ${lockInfo.lockedBy})`);
                else {
                    setLoadingMessage("Acquiring lock...");
                    lockId = await acquireLock(targetFileId);
                }
                if (!lockId) await new Promise(r => setTimeout(r, 2000));
            }

            try {
                setLoadingMessage("Refreshing data...");
                const latestTree = await loadTree(true, targetFileId!);
                setLoadingMessage("Saving changes...");
                await action(latestTree, lockId);
            } catch (e) {
                console.error("Error during locked operation", e);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                alert("An error occurred: " + (e as any).message);
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
    };

    const saveWithMerge = async (localTree: TreeDocument, summaryText: string, explicitDeletions: string[] = []) => {
        const todayFileName = generateFilename(currentTreeName);
        const files = await listTreeFiles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const todaysFile = files.find((f: any) => f.name === todayFileName);

        if (todaysFile) {
            const remoteContent = await getFileContent(todaysFile.id) as TreeDocument;
            const { mergedTree } = mergeTrees(localTree, remoteContent);
            if (explicitDeletions.length > 0) {
                explicitDeletions.forEach(delId => {
                    if (mergedTree.nodes[delId]) {
                        delete mergedTree.nodes[delId];
                        mergedTree.meta.nodeCount = Object.keys(mergedTree.nodes).length;
                    }
                });
            }
            const latestSummary = mergedTree.summary.length > 0 ? mergedTree.summary[0].changes : summaryText;
            await updateTreeFile(todaysFile.id, mergedTree, latestSummary, false);
            setCurrentTreeId(todaysFile.id);
            GlobalTreeService.registerTree(todaysFile.id, mergedTree);
            return mergedTree;
        } else {
            const newFile = await saveTreeFile(todayFileName, localTree, summaryText);
            if (newFile && newFile.id) {
                if (currentTreeId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const oldFile = files.find((f: any) => f.id === currentTreeId);
                    if (oldFile) {
                        try { await renameFile(oldFile.id, `backup_${oldFile.name}`); } catch (e) { console.error(e); }
                    }
                }
                setCurrentTreeId(newFile.id);
                GlobalTreeService.registerTree(newFile.id, localTree);
            }
            return localTree;
        }
    };

    return { executeWithLock, saveWithMerge };
}
