import type { TreeDocument, PersonNode } from '../../../logic/types';
import { GlobalTreeService } from '../../../services/GlobalTreeService';
import { touchNode } from './treeHelpers';

export const updateParentChildRelationships = (
    updatedTree: TreeDocument,
    personData: PersonNode,
    newParentId: string | null,
    oldParentId: string | null,
    currentUser: { email: string } | null,
    affectedIds: Set<string>,
    changes: string[]
) => {
    if (oldParentId && updatedTree.nodes[oldParentId]) {
        updatedTree.nodes[oldParentId].childrenIds = updatedTree.nodes[oldParentId].childrenIds.filter(id => id !== personData.nodeId);
        touchNode(updatedTree, oldParentId, currentUser, affectedIds);
    }
    if (newParentId && updatedTree.nodes[newParentId]) {
        if (!updatedTree.nodes[newParentId].childrenIds.includes(personData.nodeId)) {
            updatedTree.nodes[newParentId].childrenIds.push(personData.nodeId);
            touchNode(updatedTree, newParentId, currentUser, affectedIds);
        }
    }

    if (!oldParentId && newParentId) {
        changes.push(`Linked ${personData.name} to parent ${updatedTree.nodes[newParentId]?.name || newParentId} `);
    } else if (oldParentId && !newParentId) {
        changes.push(`Removed parent link for ${personData.name}`);
    } else {
        changes.push(`Changed parent of ${personData.name} from ${updatedTree.nodes[oldParentId!]?.name || oldParentId} to ${updatedTree.nodes[newParentId!]?.name || newParentId} `);
    }
};

export const updateChildren = (
    updatedTree: TreeDocument,
    personData: PersonNode,
    userAddedChildren: string[],
    userRemovedChildren: string[],
    currentUser: { email: string } | null,
    affectedIds: Set<string>,
    changes: string[]
) => {
    userAddedChildren.forEach(childId => {
        if (!updatedTree.nodes[personData.nodeId].childrenIds.includes(childId)) {
            updatedTree.nodes[personData.nodeId].childrenIds.push(childId);
        }
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
            const oldChildParentId = childNode.parentId;
            if (oldChildParentId && updatedTree.nodes[oldChildParentId]) {
                updatedTree.nodes[oldChildParentId].childrenIds = updatedTree.nodes[oldChildParentId].childrenIds.filter(id => id !== childId);
                touchNode(updatedTree, oldChildParentId, currentUser, affectedIds);
            }
            childNode.parentId = personData.nodeId;
            touchNode(updatedTree, childId, currentUser, affectedIds);
            changes.push(`Added child ${childNode.name} to ${personData.name} `);
        }
    });

    userRemovedChildren.forEach(childId => {
        updatedTree.nodes[personData.nodeId].childrenIds = updatedTree.nodes[personData.nodeId].childrenIds.filter(id => id !== childId);
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
            childNode.parentId = null;
            touchNode(updatedTree, childId, currentUser, affectedIds);
            changes.push(`Removed child ${childNode.name} from ${personData.name} `);
        }
    });
};

export const updateSpouseRelationships = async (
    updatedTree: TreeDocument,
    personData: PersonNode,
    userAddedSpouses: string[],
    userRemovedSpouses: string[],
    currentUser: { email: string } | null,
    affectedIds: Set<string>,
    changes: string[]
) => {
    const currentTreeId = updatedTree.treeId;

    for (const spouseId of userAddedSpouses) {
        if (!updatedTree.nodes[personData.nodeId].spouseIds.includes(spouseId)) {
            updatedTree.nodes[personData.nodeId].spouseIds.push(spouseId);
        }
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
            if (spouseNode.externalLink && spouseNode.externalLink.treeId !== currentTreeId) {
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
                touchNode(updatedTree, spouseId, currentUser, affectedIds);
                changes.push(`Added spouse link between ${personData.name} and ${spouseNode.name} `);
            }
        }
    }

    userRemovedSpouses.forEach(spouseId => {
        updatedTree.nodes[personData.nodeId].spouseIds = updatedTree.nodes[personData.nodeId].spouseIds.filter(id => id !== spouseId);
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
            spouseNode.spouseIds = spouseNode.spouseIds.filter(id => id !== personData.nodeId);
            touchNode(updatedTree, spouseId, currentUser, affectedIds);
            changes.push(`Removed spouse link between ${personData.name} and ${spouseNode.name} `);
        }
    });
};

export const updateSiblingRelationships = (
    updatedTree: TreeDocument,
    personData: PersonNode,
    newSiblingIds: string[],
    currentUser: { email: string } | null,
    affectedIds: Set<string>,
    changes: string[]
) => {
    newSiblingIds.forEach(sibId => {
        const sibNode = updatedTree.nodes[sibId];
        const parentId = personData.parentId;
        if (parentId && sibNode && sibNode.parentId !== parentId) {
            const oldSibParent = sibNode.parentId;
            if (oldSibParent && updatedTree.nodes[oldSibParent]) {
                updatedTree.nodes[oldSibParent].childrenIds = updatedTree.nodes[oldSibParent].childrenIds.filter(id => id !== sibId);
                touchNode(updatedTree, oldSibParent, currentUser, affectedIds);
            }
            sibNode.parentId = parentId;
            touchNode(updatedTree, sibId, currentUser, affectedIds);
            if (updatedTree.nodes[parentId] && !updatedTree.nodes[parentId].childrenIds.includes(sibId)) {
                updatedTree.nodes[parentId].childrenIds.push(sibId);
                touchNode(updatedTree, parentId, currentUser, affectedIds);
            }
            changes.push(`Linked sibling ${sibNode.name} to parent ${updatedTree.nodes[parentId].name} `);
        }
    });
};
