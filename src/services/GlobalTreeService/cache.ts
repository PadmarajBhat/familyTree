import type { TreeDocument, PersonNode } from '../../logic/types';

// A cache for loaded trees to avoid re-fetching constantly
// Key: treeId, Value: TreeDocument
export const loadedTreesCache: Record<string, TreeDocument> = {};

// Register a tree into the cache (e.g. the currently active tree)
export const registerTree = (fileId: string, tree: TreeDocument): void => {
    loadedTreesCache[fileId] = tree;
};

// Get a specific node from cache
export const getNode = (treeId: string, nodeId: string): PersonNode | null => {
    const tree = loadedTreesCache[treeId];
    if (!tree) return null;
    return tree.nodes[nodeId] || null;
};

/**
 * Get all nodes from all loaded trees as a flat list
 * Useful for building global relationship graphs
 * Returns an array to preserve duplicate nodes (e.g. shadow nodes) from different trees
 */
export const getAllNodesFlat = (): PersonNode[] => {
    const allNodes: PersonNode[] = [];
    Object.values(loadedTreesCache).forEach(tree => {
        Object.values(tree.nodes).forEach(node => {
            allNodes.push(node);
        });
    });
    return allNodes;
};
