import type { TreeDocument, PersonNode } from '../../logic/types';
import { listTreeFiles, getFileContent } from '../drive';

// A cache for loaded trees to avoid re-fetching constantly
// Key: treeId, Value: TreeDocument
export const loadedTreesCache: Record<string, TreeDocument> = {};

// Register a tree into the cache (e.g. the currently active tree)
export function registerTree(fileId: string, tree: TreeDocument): void {
    loadedTreesCache[fileId] = tree;
}

// Load all shortlisted trees
export async function loadShortlistedTrees(shortlistedIds: string[]): Promise<void> {
    if (shortlistedIds.length === 0) return;

    console.log("GlobalTreeService: Loading trees...", shortlistedIds);

    const files = await listTreeFiles();

    const promises = shortlistedIds.map(async (fileId) => {
        if (loadedTreesCache[fileId]) return; // Already loaded

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileMeta = files.find((f: any) => f.id === fileId);
        if (!fileMeta) return;

        // Extra Safety: Filter out backup/delete files if API query leaked them
        if (fileMeta.name.startsWith('backup_') || fileMeta.name.startsWith('delete_')) {
            console.warn(`Skipping loading of excluded file: ${fileMeta.name}`);
            return;
        }

        try {
            const content = await getFileContent(fileId);
            if (content && typeof content === 'object' && 'nodes' in content) {
                loadedTreesCache[fileMeta.id] = content as TreeDocument;
            }
        } catch (e) {
            console.error(`Failed to load tree ${fileId}`, e);
        }
    });

    await Promise.all(promises);
}

// Get all nodes from all loaded trees as a flat list
// Useful for building global relationship graphs
// Returns an array to preserve duplicate nodes (e.g. shadow nodes) from different trees
export function getAllNodesFlat(): PersonNode[] {
    const allNodes: PersonNode[] = [];
    Object.values(loadedTreesCache).forEach(tree => {
        Object.values(tree.nodes).forEach(node => {
            allNodes.push(node);
        });
    });
    return allNodes;
}

// Get a specific node from cache
export function getNode(treeId: string, nodeId: string): PersonNode | null {
    const tree = loadedTreesCache[treeId];
    if (!tree) return null;
    return tree.nodes[nodeId] || null;
}
