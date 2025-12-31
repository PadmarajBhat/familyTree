import type { TreeDocument, PersonNode } from '../../../logic/types';
import { getISTTimestamp } from '../../../logic/dateUtils';

export const initializeEmptyTree = (currentUser: { email: string; name: string } | null): TreeDocument => {
    return {
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
};

export const mergeShadowNodes = (nodes: Record<string, PersonNode>, shadowNodes: PersonNode[]) => {
    if (shadowNodes && shadowNodes.length > 0) {
        shadowNodes.forEach(shadow => {
            if (!nodes[shadow.nodeId]) {
                nodes[shadow.nodeId] = shadow;
            }
        });
    }
};

export const touchNode = (
    updatedTree: TreeDocument,
    nodeId: string,
    currentUser: { email: string } | null,
    affectedIds: Set<string>
) => {
    if (updatedTree.nodes[nodeId]) {
        updatedTree.nodes[nodeId].editedBy = currentUser?.email || 'unknown';
        updatedTree.nodes[nodeId].editedTime = getISTTimestamp();
        affectedIds.add(nodeId);
    }
};

export const ensureRootNode = (updatedTree: TreeDocument): { error?: string } => {
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
            return { error: 'Tree has no nodes.' };
        }
    }
    return {};
};

export const findNewRootFromNode = (updatedTree: TreeDocument, startNodeId: string): string => {
    let newRootId = startNodeId;
    const visited = new Set<string>();
    while (updatedTree.nodes[newRootId] && updatedTree.nodes[newRootId].parentId) {
        if (visited.has(newRootId)) {
            console.error("Cycle detected while finding new root!");
            break;
        }
        visited.add(newRootId);
        newRootId = updatedTree.nodes[newRootId].parentId!;
    }
    return newRootId;
};
