import { useCallback } from 'react';
import type { TreeDocument, PersonNode } from '../../logic/types';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import {
    saveNodesBatchToSheets,
    deleteNodesFromSheets,
    syncAllRelationshipsToSheets,
    saveMetadataToSheets,
    listTreeFiles,
    getFileContent,
    updateTreeFile,
    saveTreeFile,
    renameFile
} from '../../services/drive';
import { mergeTrees } from '../../logic/merge';
import { generateFilename } from '../../logic/fileUtils';

interface UseTreeSavingProps {
    isSheetsMode: boolean;
    setLoading: (loading: boolean) => void;
    setLoadingMessage: (msg: string) => void;
    setTree: (tree: TreeDocument | null) => void;
    currentTreeName: string;
    currentTreeId: string | null;
    setCurrentTreeId: (id: string | null) => void;
}

export const useTreeSaving = ({
    isSheetsMode,
    setLoading,
    setLoadingMessage,
    setTree,
    currentTreeName,
    currentTreeId,
    setCurrentTreeId
}: UseTreeSavingProps) => {

    const saveWithMerge = useCallback(async (
        localTree: TreeDocument,
        summaryText: string,
        explicitDeletions: string[] = [],
        affectedNodeIds?: string[]
    ) => {
        // PHASE 2: Sheets Mode logic
        if (isSheetsMode) {
            console.log("App: Saving in Sheets Mode (Selective Sync)...");
            setLoading(true);
            setLoadingMessage("Saving to Sheets...");
            try {
                // Parallelized Sync for Sheets Mode
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const syncTasks: Promise<any>[] = [];

                // 1. Sync Nodes (Selective if IDs provided, else all)
                const nodesToSync = affectedNodeIds
                    ? affectedNodeIds.map(id => localTree.nodes[id]).filter(n => n && !n.externalLink) as PersonNode[]
                    : Object.values(localTree.nodes).filter(n => !n.externalLink) as PersonNode[];

                if (nodesToSync.length > 0) {
                    syncTasks.push(saveNodesBatchToSheets(nodesToSync));
                }

                // 2. Handle Deletions
                if (explicitDeletions.length > 0) {
                    syncTasks.push(deleteNodesFromSheets(explicitDeletions));
                }

                // 3. Sync All Relationships (Keeps sheet clean and is very fast for < 500 nodes)
                syncTasks.push(syncAllRelationshipsToSheets(Object.values(localTree.nodes)));

                // 4. Sync Metadata for logical root preservation
                syncTasks.push(saveMetadataToSheets({
                    treeId: localTree.treeId,
                    treeName: localTree.treeName,
                    rootNodeId: localTree.rootNodeId,
                    schemaVersion: String(localTree.schemaVersion),
                    versionIndex: String(localTree.versionIndex),
                    timestamp: localTree.timestamp,
                    createdBy: localTree.meta.createdBy,
                    createdTime: localTree.meta.createdTime
                }));

                await Promise.all(syncTasks);

                setTree(localTree);
                GlobalTreeService.registerTree('sheets_main', localTree);
                return localTree;
            } finally {
                setLoading(false);
            }
        }

        const todayFileName = generateFilename(currentTreeName);
        const files = await listTreeFiles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileslist = files as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const todaysFile = fileslist.find((f: any) => f.name === todayFileName);

        if (todaysFile) {
            console.log("Found today's file, merging...", todaysFile.id);

            const remoteContent = await getFileContent(todaysFile.id) as TreeDocument;
            const { mergedTree } = mergeTrees(localTree, remoteContent);

            // Enforce explicit deletions to prevent resurrection by merge
            if (explicitDeletions.length > 0) {
                explicitDeletions.forEach(delId => {
                    if (mergedTree.nodes[delId]) {
                        console.log(`Enforcing deletion of ${delId} after merge.`);
                        delete mergedTree.nodes[delId];
                        mergedTree.meta.nodeCount = Object.keys(mergedTree.nodes).length;
                    }
                });
            }

            const latestSummary = mergedTree.summary.length > 0 ? mergedTree.summary[0].changes : summaryText;

            await updateTreeFile(todaysFile.id, mergedTree, latestSummary, false);
            setCurrentTreeId(todaysFile.id);

            // Update cache
            GlobalTreeService.registerTree(todaysFile.id, mergedTree);

            return mergedTree;
        } else {
            console.log("Creating new file for today...", todayFileName);

            // SAFETY FIX: Save the NEW file first.
            const newFile = await saveTreeFile(todayFileName, localTree);

            if (newFile && newFile.id) {
                // New file saved successfully. Now we can safely archive the old one.
                if (currentTreeId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const oldFile = fileslist.find((f: any) => f.id === currentTreeId);
                    if (oldFile) {
                        const backupName = `backup_${oldFile.name}`;
                        console.log(`Renaming old file ${oldFile.name} to ${backupName}`);
                        try {
                            await renameFile(oldFile.id, backupName);
                        } catch (e) {
                            console.error("Failed to rename backup file", e);
                        }
                    }
                }

                setCurrentTreeId(newFile.id);
                // Update cache
                GlobalTreeService.registerTree(newFile.id, localTree);
            } else {
                console.error("Failed to save new tree file.");
                throw new Error("Failed to save new tree version. Aborted backup of old file to prevent data loss.");
            }
            return localTree;
        }
    }, [isSheetsMode, setLoading, setLoadingMessage, setTree, currentTreeName, currentTreeId, setCurrentTreeId]);

    return { saveWithMerge };
};
