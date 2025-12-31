import type { TreeDocument, PersonNode } from '../../../logic/types';
import { getISTTimestamp } from '../../../logic/dateUtils';
import { initializeEmptyTree, mergeShadowNodes, ensureRootNode, findNewRootFromNode } from './treeHelpers';
import { updateParentChildRelationships, updateChildren, updateSpouseRelationships, updateSiblingRelationships } from './relationshipUpdates';

export interface MutationResult {
    updatedTree: TreeDocument;
    summaryText: string;
    affectedIds: string[];
    shouldSave: boolean;
    error?: string;
}

export const prepareUpdatedTree = async (
    latestTree: TreeDocument | null,
    currentUser: { email: string; name: string } | null,
    editorMode: 'add' | 'edit' | null,
    personData: PersonNode,
    newParentId: string | null,
    newChildrenIds: string[],
    newSpouseIds: string[],
    newSiblingIds: string[],
    shadowNodes: PersonNode[],
    userViewNode: PersonNode | null
): Promise<MutationResult> => {

    const currentTree: TreeDocument = latestTree ? JSON.parse(JSON.stringify(latestTree)) : initializeEmptyTree(currentUser);

    // Merge pending shadow nodes
    mergeShadowNodes(currentTree.nodes, shadowNodes);

    const updatedTree: TreeDocument = currentTree;
    const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null;
    const oldParentId = oldNode?.parentId || null;

    const affectedIds = new Set<string>();

    // Track current person touch
    affectedIds.add(personData.nodeId);
    personData.editedBy = currentUser?.email || 'unknown';
    personData.editedTime = getISTTimestamp();

    // Changelog logic
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
        const fieldsChangedLog = Array.from(userChangedFields);
        if (fieldsChangedLog.length > 0) {
            changes.push(`Edited ${personData.name} with ${fieldsChangedLog.join(', ')} `);
        }
    }

    // Apply Node Data Updates
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

    // 1. Parent/Child Updates (Upward)
    if ((editorMode === 'add' || userChangedFields.has('parentId')) && newParentId !== oldParentId) {
        updateParentChildRelationships(updatedTree, personData, newParentId, oldParentId, currentUser, affectedIds, changes);
    }

    // 2. Children Updates (Downward)
    const userAddedChildren = newChildrenIds.filter(id => !userViewNode?.childrenIds.includes(id));
    const userRemovedChildren = userViewNode ? userViewNode.childrenIds.filter(id => !newChildrenIds.includes(id)) : [];
    updateChildren(updatedTree, personData, userAddedChildren, userRemovedChildren, currentUser, affectedIds, changes);

    // Check for Root Reparenting
    const rootWasReparented = userAddedChildren.some(childId => childId === updatedTree.rootNodeId);
    if (rootWasReparented) {
        const newRootId = findNewRootFromNode(updatedTree, personData.nodeId);
        console.log(`Root node updated from ${updatedTree.rootNodeId} to ${newRootId} `);
        updatedTree.rootNodeId = newRootId;
    }

    // 3. Spouse Updates
    const userAddedSpouses = newSpouseIds.filter(id => !userViewNode?.spouseIds.includes(id));
    const userRemovedSpouses = userViewNode ? userViewNode.spouseIds.filter(id => !newSpouseIds.includes(id)) : [];

    await updateSpouseRelationships(updatedTree, personData, userAddedSpouses, userRemovedSpouses, currentUser, affectedIds, changes);

    // 4. Sibling Updates
    updateSiblingRelationships(updatedTree, personData, newSiblingIds, currentUser, affectedIds, changes);

    updatedTree.timestamp = getISTTimestamp();

    if (editorMode === 'add') {
        updatedTree.meta.nodeCount++;
        if (!updatedTree.rootNodeId) {
            updatedTree.rootNodeId = personData.nodeId;
        }
    }

    // Additional check for root update if the person themselves was the root and got a parent
    if (personData.nodeId === updatedTree.rootNodeId && personData.parentId) {
        const newRootId = findNewRootFromNode(updatedTree, personData.parentId);
        updatedTree.rootNodeId = newRootId;
        console.log(`Root node updated from ${personData.nodeId} to ${newRootId} `);
    }

    const summaryText = changes.join('; ');
    if (!summaryText && editorMode === 'edit') {
        return { updatedTree, summaryText: '', affectedIds: [], shouldSave: false };
    }

    if (summaryText) {
        updatedTree.summary.unshift({
            editedBy: currentUser?.email || 'unknown',
            editedTime: getISTTimestamp(),
            changes: summaryText,
            rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
        });
    }

    const verification = ensureRootNode(updatedTree);
    if (verification.error) {
        return { updatedTree, summaryText: '', affectedIds: [], shouldSave: false, error: verification.error };
    }

    return { updatedTree, summaryText, affectedIds: Array.from(affectedIds), shouldSave: true };
};
