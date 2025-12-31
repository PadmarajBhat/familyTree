import { useCallback } from 'react';
import type { TreeDocument } from '../../logic/types';
import { isGlobalEditor } from '../../logic/permissions';
import { getISTTimestamp } from '../../logic/dateUtils';

interface UseMemberDeletionProps {
    tree: TreeDocument | null;
    currentUser: { email: string; name: string } | null;
    setTree: (tree: TreeDocument | null) => void;
    setSelectedNodeId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    executeWithLock: (action: (latestTree: TreeDocument | null, lockId: string) => Promise<void>) => Promise<void>;
    saveWithMerge: (localTree: TreeDocument, summaryText: string, explicitDeletions?: string[], affectedNodeIds?: string[]) => Promise<TreeDocument>;
}

export const useMemberDeletion = ({
    tree,
    currentUser,
    setTree,
    setSelectedNodeId,
    setLoading,
    executeWithLock,
    saveWithMerge
}: UseMemberDeletionProps) => {

    const handleDeleteMember = useCallback(async (nodeId: string) => {
        if (!tree) return;
        if (!currentUser) {
            alert("You must be signed in to delete members.");
            return;
        }

        await executeWithLock(async (latestTree, _lockId) => {
            if (!latestTree) return;
            const node = latestTree.nodes[nodeId];
            if (!node) return;

            // Strict Orphan Check
            const isOrphan = !node.parentId && node.childrenIds.length === 0 && node.spouseIds.length === 0;

            // Permission Check: Only global editors can delete
            if (!isGlobalEditor(latestTree, currentUser.email)) {
                alert("Only editors can delete members.");
                return;
            }

            if (!isOrphan) {
                alert("Cannot delete member. Member must be an orphan (no parents, children, or spouses). Please unlink relationships first.");
                return;
            }

            const updatedTree: TreeDocument = JSON.parse(JSON.stringify(latestTree));

            // Remove node
            delete updatedTree.nodes[nodeId];
            updatedTree.meta.nodeCount--;
            updatedTree.timestamp = getISTTimestamp();

            // If root was deleted, clear rootNodeId
            if (updatedTree.rootNodeId === nodeId) {
                updatedTree.rootNodeId = "";
                const remainingIds = Object.keys(updatedTree.nodes);
                if (remainingIds.length > 0) {
                    updatedTree.rootNodeId = remainingIds[0];
                }
            }

            // Add Change Log
            updatedTree.summary.unshift({
                editedBy: currentUser?.email || 'unknown',
                editedTime: getISTTimestamp(),
                changes: `Deleted ${node.name} `,
                rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
            });

            try {
                setLoading(true);
                const savedTree = await saveWithMerge(updatedTree, updatedTree.summary[0]?.changes || "Deleted member", [nodeId], []);

                setTree(savedTree);
                setSelectedNodeId(null); // Close detail view
                alert("Member deleted successfully.");
            } catch (err) {
                console.error("Failed to delete member:", err);
                alert("Failed to save changes to Google Drive.");
            }
        });
    }, [tree, currentUser, executeWithLock, saveWithMerge, setTree, setSelectedNodeId, setLoading]);

    return { handleDeleteMember };
};
