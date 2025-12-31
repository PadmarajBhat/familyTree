import { useCallback } from 'react';
import type { TreeDocument, PersonNode } from '../../logic/types';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { grantWritePermission, grantLockFilePermission, releaseLock } from '../../services/drive';
import { getISTTimestamp } from '../../logic/dateUtils';

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
                meta: {
                    createdBy: currentUser?.email || "unknown",
                    createdTime: getISTTimestamp(),
                    nodeCount: 0
                }
            };

            // Merge pending shadow nodes
            if (shadowNodes && shadowNodes.length > 0) {
                shadowNodes.forEach(shadow => {
                    if (!currentTree.nodes[shadow.nodeId]) {
                        currentTree.nodes[shadow.nodeId] = shadow;
                    }
                });
            }

            const updatedTree: TreeDocument = currentTree;
            const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null;
            const oldParentId = oldNode?.parentId || null;

            const affectedIds = new Set<string>();
            const touchNode = (nodeId: string) => {
                if (updatedTree.nodes[nodeId]) {
                    updatedTree.nodes[nodeId].editedBy = currentUser?.email || 'unknown';
                    updatedTree.nodes[nodeId].editedTime = getISTTimestamp();
                    affectedIds.add(nodeId);
                }
            };

            affectedIds.add(personData.nodeId);
            personData.editedBy = currentUser?.email || 'unknown';
            personData.editedTime = getISTTimestamp();

            const userChangedFields = new Set<string>();
            if (editorMode === 'edit' && userViewNode) {
                (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => {
                    if (JSON.stringify(personData[key]) !== JSON.stringify(userViewNode[key])) {
                        userChangedFields.add(key);
                    }
                });
            } else if (editorMode === 'add') {
                (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => userChangedFields.add(key));
            }

            const changes: string[] = [];

            if (editorMode === 'add') {
                changes.push(`Added ${personData.name} `);
            } else {
                const fieldsChangedLog: string[] = [];
                userChangedFields.forEach(key => {
                    fieldsChangedLog.push(key);
                });

                if (fieldsChangedLog.length > 0) {
                    changes.push(`Edited ${personData.name} with ${fieldsChangedLog.join(', ')} `);
                }
            }

            if (editorMode === 'edit' && oldNode) {
                userChangedFields.forEach(key => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (updatedTree.nodes[personData.nodeId] as any)[key] = (personData as any)[key];
                });
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

                if (!oldParentId && newParentId) {
                    changes.push(`Linked ${personData.name} to parent ${updatedTree.nodes[newParentId]?.name || newParentId} `);
                } else if (oldParentId && !newParentId) {
                    changes.push(`Removed parent link for ${personData.name}`);
                } else {
                    changes.push(`Changed parent of ${personData.name} from ${updatedTree.nodes[oldParentId!]?.name || oldParentId} to ${updatedTree.nodes[newParentId!]?.name || newParentId} `);
                }
            }

            const userAddedChildren = newChildrenIds.filter(id => !userViewNode?.childrenIds.includes(id));
            const userRemovedChildren = userViewNode ? userViewNode.childrenIds.filter(id => !newChildrenIds.includes(id)) : [];

            userAddedChildren.forEach(childId => {
                if (!updatedTree.nodes[personData.nodeId].childrenIds.includes(childId)) {
                    updatedTree.nodes[personData.nodeId].childrenIds.push(childId);
                }
                const childNode = updatedTree.nodes[childId];
                if (childNode) {
                    const oldChildParentId = childNode.parentId;
                    if (oldChildParentId && updatedTree.nodes[oldChildParentId]) {
                        updatedTree.nodes[oldChildParentId].childrenIds = updatedTree.nodes[oldChildParentId].childrenIds.filter(id => id !== childId);
                        touchNode(oldChildParentId);
                    }
                    childNode.parentId = personData.nodeId;
                    touchNode(childId);
                    changes.push(`Added child ${childNode.name} to ${personData.name} `);
                }
            });

            userRemovedChildren.forEach(childId => {
                updatedTree.nodes[personData.nodeId].childrenIds = updatedTree.nodes[personData.nodeId].childrenIds.filter(id => id !== childId);
                const childNode = updatedTree.nodes[childId];
                if (childNode) {
                    childNode.parentId = null;
                    touchNode(childId);
                    changes.push(`Removed child ${childNode.name} from ${personData.name} `);
                }
            });

            const rootWasReparented = userAddedChildren.some(childId => childId === updatedTree.rootNodeId);
            if (rootWasReparented) {
                let newRootId = personData.nodeId;
                const visited = new Set<string>();
                while (updatedTree.nodes[newRootId] && updatedTree.nodes[newRootId].parentId) {
                    if (visited.has(newRootId)) {
                        console.error("Cycle detected while finding new root!");
                        break;
                    }
                    visited.add(newRootId);
                    newRootId = updatedTree.nodes[newRootId].parentId!;
                }
                console.log(`Root node updated from ${updatedTree.rootNodeId} to ${newRootId} `);
                updatedTree.rootNodeId = newRootId;
            }

            const userAddedSpouses = newSpouseIds.filter(id => !userViewNode?.spouseIds.includes(id));
            const userRemovedSpouses = userViewNode ? userViewNode.spouseIds.filter(id => !newSpouseIds.includes(id)) : [];

            userAddedSpouses.forEach(async spouseId => {
                if (!updatedTree.nodes[personData.nodeId].spouseIds.includes(spouseId)) {
                    updatedTree.nodes[personData.nodeId].spouseIds.push(spouseId);
                }
                const spouseNode = updatedTree.nodes[spouseId];
                if (spouseNode) {
                    if (spouseNode.externalLink && spouseNode.externalLink.treeId !== currentTree.treeId) {
                        const success = await GlobalTreeService.addSpouseToRemoteNode(
                            spouseNode.externalLink.treeId,
                            spouseNode.externalLink.nodeId,
                            personData.nodeId,
                            currentUser?.email || 'unknown'
                        );
                        if (success) {
                            changes.push(`Linked ${personData.name} as spouse to remote node ${spouseNode.name} in tree ${spouseNode.externalLink.treeName}`);
                        }
                    }

                    if (!spouseNode.spouseIds.includes(personData.nodeId)) {
                        spouseNode.spouseIds.push(personData.nodeId);
                        touchNode(spouseId);
                        changes.push(`Added spouse link between ${personData.name} and ${spouseNode.name} `);
                    }
                }
            });

            userRemovedSpouses.forEach(spouseId => {
                updatedTree.nodes[personData.nodeId].spouseIds = updatedTree.nodes[personData.nodeId].spouseIds.filter(id => id !== spouseId);
                const spouseNode = updatedTree.nodes[spouseId];
                if (spouseNode) {
                    spouseNode.spouseIds = spouseNode.spouseIds.filter(id => id !== personData.nodeId);
                    touchNode(spouseId);
                    changes.push(`Removed spouse link between ${personData.name} and ${spouseNode.name} `);
                }
            });

            newSiblingIds.forEach(sibId => {
                const sibNode = updatedTree.nodes[sibId];
                const parentId = personData.parentId;
                if (parentId && sibNode && sibNode.parentId !== parentId) {
                    const oldSibParent = sibNode.parentId;
                    if (oldSibParent && updatedTree.nodes[oldSibParent]) {
                        updatedTree.nodes[oldSibParent].childrenIds = updatedTree.nodes[oldSibParent].childrenIds.filter(id => id !== sibId);
                        touchNode(oldSibParent);
                    }
                    sibNode.parentId = parentId;
                    touchNode(sibId);
                    if (updatedTree.nodes[parentId] && !updatedTree.nodes[parentId].childrenIds.includes(sibId)) {
                        updatedTree.nodes[parentId].childrenIds.push(sibId);
                        touchNode(parentId);
                    }
                    changes.push(`Linked sibling ${sibNode.name} to parent ${updatedTree.nodes[parentId].name} `);
                }
            });

            updatedTree.timestamp = getISTTimestamp();

            if (editorMode === 'add') {
                updatedTree.meta.nodeCount++;
                if (!updatedTree.rootNodeId) {
                    updatedTree.rootNodeId = personData.nodeId;
                }
            }

            if (personData.nodeId === updatedTree.rootNodeId && personData.parentId) {
                let newRootId = personData.parentId;
                const visited = new Set<string>();
                while (updatedTree.nodes[newRootId] && updatedTree.nodes[newRootId].parentId) {
                    if (visited.has(newRootId)) {
                        console.error("Cycle detected while finding new root!");
                        break;
                    }
                    visited.add(newRootId);
                    newRootId = updatedTree.nodes[newRootId].parentId!;
                }
                updatedTree.rootNodeId = newRootId;
                console.log(`Root node updated from ${personData.nodeId} to ${newRootId} `);
            }

            const summaryText = changes.join('; ');
            if (!summaryText && editorMode === 'edit') {
                setEditorMode(null);
                setEditingNodeId(null);
                alert("No changes detected.");
                return;
            }

            if (summaryText) {
                updatedTree.summary.unshift({
                    editedBy: currentUser?.email || 'unknown',
                    editedTime: getISTTimestamp(),
                    changes: summaryText,
                    rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
                });
            }

            if (!updatedTree.rootNodeId || !updatedTree.nodes[updatedTree.rootNodeId]) {
                console.warn('Invalid rootNodeId detected before save! Attempting to fix...');
                const nodeIds = Object.keys(updatedTree.nodes);
                if (nodeIds.length > 0) {
                    const newRoot = Object.values(updatedTree.nodes).find(n => !n.parentId);
                    if (newRoot) {
                        updatedTree.rootNodeId = newRoot.nodeId;
                    } else {
                        updatedTree.rootNodeId = nodeIds[0];
                    }
                } else {
                    alert('Error: Tree has no nodes. Cannot save.');
                    return;
                }
            }

            try {
                setLoading(true);
                const savedTree = await saveWithMerge(updatedTree, summaryText, [], Array.from(affectedIds));

                if (personData.email) {
                    await grantWritePermission(currentTree.treeId, personData.email);
                    await grantLockFilePermission(currentTree.treeId, personData.email);
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
