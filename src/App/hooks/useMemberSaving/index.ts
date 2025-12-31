import { useCallback } from 'react';
import type { TreeDocument, PersonNode } from '../../../logic/types';
import { grantWritePermission, grantLockFilePermission, releaseLock } from '../../../services/drive';
import { prepareUpdatedTree } from './treeMutationUtils';

interface UseMemberSavingProps {
    tree: TreeDocument | null;
    currentUser: { email: string; name: string } | null;
    editorMode: 'add' | 'edit' | null;
    setEditorMode: (mode: 'add' | 'edit' | null) => void;
    setEditingNodeId: (id: string | null) => void;
    setTree: (tree: TreeDocument | null) => void;
    setLoading: (loading: boolean) => void;
    executeWithLock: (action: (latestTree: TreeDocument | null, lockId: string) => Promise<void>) => Promise<void>;
    saveWithMerge: (localTree: TreeDocument, summaryText: string, explicitDeletions?: string[], affectedNodeIds?: string[]) => Promise<TreeDocument>;
}

export const useMemberSaving = ({
    tree,
    currentUser,
    editorMode,
    setEditorMode,
    setEditingNodeId,
    setTree,
    setLoading,
    executeWithLock,
    saveWithMerge
}: UseMemberSavingProps) => {

    const handleSaveMember = useCallback(async (
        personData: PersonNode,
        newParentId: string | null,
        newChildrenIds: string[],
        newSpouseIds: string[],
        newSiblingIds: string[],
        shadowNodes: PersonNode[] = []
    ) => {
        const userViewNode = editorMode === 'edit' && tree ? tree.nodes[personData.nodeId] : null;

        await executeWithLock(async (latestTree, lockId) => {
            const { updatedTree, summaryText, affectedIds, shouldSave, error } = await prepareUpdatedTree(
                latestTree,
                currentUser,
                editorMode,
                personData,
                newParentId,
                newChildrenIds,
                newSpouseIds,
                newSiblingIds,
                shadowNodes,
                userViewNode
            );

            if (!shouldSave) {
                if (error) {
                    alert(error);
                } else {
                    setEditorMode(null);
                    setEditingNodeId(null);
                    alert("No changes detected.");
                }
                return;
            }

            try {
                setLoading(true);
                const savedTree = await saveWithMerge(updatedTree, summaryText, [], affectedIds);

                if (personData.email) {
                    await grantWritePermission(updatedTree.treeId, personData.email);
                    await grantLockFilePermission(updatedTree.treeId, personData.email);
                }

                setTree(savedTree);
                setEditorMode(null);
                setEditingNodeId(null);

                if (lockId) await releaseLock(lockId);
                alert("Member saved successfully!");
            } catch (err) {
                console.error("Failed to save tree:", err);
                alert("Failed to save changes.");
            }
        });
    }, [tree, currentUser, editorMode, setEditorMode, setEditingNodeId, setTree, setLoading, executeWithLock, saveWithMerge]);

    return { handleSaveMember };
};
