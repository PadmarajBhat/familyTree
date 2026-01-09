import {
    grantWritePermission,
    grantLockFilePermission,
} from '../../services/drive';
import { getISTTimestamp } from '../../logic/dateUtils';
import { isGlobalEditor } from '../../logic/permissions';
import { useTreeStorage } from './useTreeStorage';
import type { TreeDocument, PersonNode } from '../../logic/types';

interface UseMemberActionsProps {
    tree: TreeDocument | null;
    setTree: (tree: TreeDocument | null) => void;
    currentUser: { email: string; name: string } | null;
    currentTreeId: string | null;
    setCurrentTreeId: (id: string | null) => void;
    currentTreeName: string;
    setLoading: (loading: boolean) => void;
    setLoadingMessage: (msg: string) => void;
    setEditorMode: (mode: 'add' | 'edit' | null) => void;
    setEditingNodeId: (id: string | null) => void;
    setSelectedNodeId: (id: string | null) => void;
    loadTree: (returnOnly?: boolean, specificFileId?: string) => Promise<TreeDocument | null>;
}

export function useMemberActions({
    tree, setTree, currentUser, currentTreeId, setCurrentTreeId,
    currentTreeName, setLoading, setLoadingMessage,
    setEditorMode, setEditingNodeId, setSelectedNodeId, loadTree
}: UseMemberActionsProps) {

    const { executeWithLock, saveWithMerge } = useTreeStorage({
        currentTreeName, currentTreeId, setCurrentTreeId,
        setLoading, setLoadingMessage, loadTree
    });

    const handleSaveMember = async (
        personData: PersonNode,
        newParentId: string | null,
        newChildrenIds: string[],
        newSpouseIds: string[],
        _newSiblingIds: string[],
        shadowNodes: PersonNode[] = [],
        editorMode: 'add' | 'edit' | null
    ) => {
        const userViewNode = editorMode === 'edit' && tree ? tree.nodes[personData.nodeId] : null;

        await executeWithLock(async (latestTree) => {
            const currentTree: TreeDocument = latestTree ? JSON.parse(JSON.stringify(latestTree)) : {
                schemaVersion: 1,
                treeId: crypto.randomUUID(),
                treeName: "Family Tree",
                versionIndex: 0,
                timestamp: getISTTimestamp(),
                rootNodeId: "",
                nodes: {},
                marriages: [],
                summary: [],
                meta: { createdBy: currentUser?.email || "unknown", createdTime: getISTTimestamp(), nodeCount: 0 }
            };

            if (shadowNodes && shadowNodes.length > 0) {
                shadowNodes.forEach(shadow => { if (!currentTree.nodes[shadow.nodeId]) currentTree.nodes[shadow.nodeId] = shadow; });
            }

            const updatedTree: TreeDocument = currentTree;
            const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null;
            const oldParentId = oldNode?.parentId || null;

            const touchNode = (nodeId: string) => {
                if (updatedTree.nodes[nodeId]) {
                    updatedTree.nodes[nodeId].editedBy = currentUser?.email || 'unknown';
                    updatedTree.nodes[nodeId].editedTime = getISTTimestamp();
                }
            };

            personData.editedBy = currentUser?.email || 'unknown';
            personData.editedTime = getISTTimestamp();

            const userChangedFields = new Set<string>();
            if (editorMode === 'edit' && userViewNode) {
                (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => {
                    if (JSON.stringify(personData[key]) !== JSON.stringify(userViewNode[key])) userChangedFields.add(key);
                });
            } else if (editorMode === 'add') {
                (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => userChangedFields.add(key));
            }

            const changes: string[] = [];
            if (editorMode === 'add') changes.push(`Added ${personData.name} `);
            else if (userChangedFields.size > 0) changes.push(`Edited ${personData.name} `);

            if (editorMode === 'edit' && oldNode) {
                userChangedFields.forEach(key => { (updatedTree.nodes[personData.nodeId] as any)[key] = (personData as any)[key]; });
                updatedTree.nodes[personData.nodeId].editedBy = personData.editedBy;
                updatedTree.nodes[personData.nodeId].editedTime = personData.editedTime;
            } else if (editorMode === 'add') {
                updatedTree.nodes[personData.nodeId] = personData;
            }

            if ((editorMode === 'add' || userChangedFields.has('parentId')) && newParentId !== oldParentId) {
                if (oldParentId && updatedTree.nodes[oldParentId]) {
                    updatedTree.nodes[oldParentId].childrenIds = updatedTree.nodes[oldParentId].childrenIds.filter(id => id !== personData.nodeId);
                    touchNode(oldParentId);
                }
                if (newParentId && updatedTree.nodes[newParentId]) {
                    if (!updatedTree.nodes[newParentId].childrenIds.includes(personData.nodeId)) {
                        updatedTree.nodes[newParentId].childrenIds.push(personData.nodeId);
                        touchNode(newParentId);
                    }
                }
            }

            newChildrenIds.forEach(childId => {
                const childNode = updatedTree.nodes[childId];
                if (childNode) {
                    childNode.parentId = personData.nodeId;
                    if (!updatedTree.nodes[personData.nodeId].childrenIds.includes(childId)) updatedTree.nodes[personData.nodeId].childrenIds.push(childId);
                    touchNode(childId);
                }
            });

            newSpouseIds.forEach(async spouseId => {
                const spouseNode = updatedTree.nodes[spouseId];
                if (spouseNode) {
                    if (!spouseNode.spouseIds.includes(personData.nodeId)) spouseNode.spouseIds.push(personData.nodeId);
                    if (!updatedTree.nodes[personData.nodeId].spouseIds.includes(spouseId)) updatedTree.nodes[personData.nodeId].spouseIds.push(spouseId);
                    touchNode(spouseId);
                }
            });

            updatedTree.timestamp = getISTTimestamp();
            if (editorMode === 'add') {
                updatedTree.meta.nodeCount++;
                if (!updatedTree.rootNodeId) updatedTree.rootNodeId = personData.nodeId;
            }

            const summaryText = changes.join('; ');
            if (summaryText) {
                updatedTree.summary.unshift({
                    editedBy: currentUser?.email || 'unknown',
                    editedTime: getISTTimestamp(),
                    changes: summaryText,
                    rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
                });
            }

            try {
                const savedTree = await saveWithMerge(updatedTree, summaryText);
                if (personData.email) {
                    await grantWritePermission(currentTree.treeId, personData.email);
                    await grantLockFilePermission(currentTree.treeId, personData.email);
                }
                setTree(savedTree);
                setEditorMode(null);
                setEditingNodeId(null);
                alert("Member saved successfully!");
            } catch (err) { alert("Failed to save changes."); }
        });
    };

    const handleDeleteMember = async (nodeId: string) => {
        if (!tree || !currentUser) return;
        await executeWithLock(async (latestTree) => {
            if (!latestTree) return;
            const node = latestTree.nodes[nodeId];
            if (!node) return;
            if (!isGlobalEditor(latestTree, currentUser.email)) { alert("Only editors can delete members."); return; }
            if (node.parentId || node.childrenIds.length > 0 || node.spouseIds.length > 0) {
                alert("Cannot delete member. Please unlink relationships first."); return;
            }
            const updatedTree: TreeDocument = JSON.parse(JSON.stringify(latestTree));
            delete updatedTree.nodes[nodeId];
            updatedTree.meta.nodeCount--;
            updatedTree.timestamp = getISTTimestamp();
            updatedTree.summary.unshift({
                editedBy: currentUser.email, editedTime: getISTTimestamp(), changes: `Deleted ${node.name}`,
                rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
            });
            const savedTree = await saveWithMerge(updatedTree, `Deleted ${node.name}`, [nodeId]);
            setTree(savedTree);
            setSelectedNodeId(null);
            alert("Member deleted successfully.");
        });
    };

    const handleToggleEditor = async (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => {
        if (!currentUser || !tree) return;
        await executeWithLock(async (latestTree) => {
            if (!latestTree) return;
            const currentUserNode = Object.values(latestTree.nodes)
                .find(n => n.email?.toLowerCase() === currentUser.email.toLowerCase());
            const isCreator = latestTree.meta.createdBy?.toLowerCase() === currentUser.email.toLowerCase();
            if (!(currentUserNode?.isEditor || isCreator)) { alert("Only editors can modify permissions."); return; }

            const updatedTree: TreeDocument = JSON.parse(JSON.stringify(latestTree));
            const targetNode = updatedTree.nodes[nodeId];
            if (!targetNode) return;
            targetNode.isEditor = newStatus;
            targetNode.editorSince = newStatus ? getISTTimestamp() : null;
            targetNode.editedBy = currentUser.email;
            targetNode.editedTime = getISTTimestamp();
            if (updates) {
                if (updates.email) targetNode.email = updates.email;
                if (updates.phone) targetNode.phone = updates.phone;
            }
            updatedTree.versionIndex++;
            updatedTree.timestamp = getISTTimestamp();
            const savedTree = await saveWithMerge(updatedTree, `Edited ${targetNode.name} with isEditor`);
            setTree(savedTree);
            alert(`Editor access updated!`);
        });
    };

    return { handleSaveMember, handleDeleteMember, handleToggleEditor };
}
