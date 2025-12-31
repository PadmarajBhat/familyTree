import type { PersonNode } from '../../logic/types';
import { listTreeFiles } from '../drive';
import { loadedTreesCache } from './cache';

export interface SearchResult {
    treeId: string;
    treeName: string;
    node: PersonNode;
    parentName?: string | null;
}

// Load all shortlisted trees
export const loadShortlistedTrees = async (shortlistedIds: string[]): Promise<void> => {
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
            const { loadMainTreeFromSheets } = await import('./hydration');
            const tree = await loadMainTreeFromSheets(fileId);
            if (tree) {
                loadedTreesCache[fileId] = tree;
            }
        } catch (e) {
            console.error(`Failed to load tree ${fileId}`, e);
        }
    });

    await Promise.all(promises);
};

// Unified Search
export const searchAllTrees = (query: string): SearchResult[] => {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    Object.entries(loadedTreesCache).forEach(([fileId, tree]) => {
        Object.values(tree.nodes).forEach(node => {
            const nameMatch = node.name?.toLowerCase().includes(lowerQuery) || false;
            const matchesTranslations = node.nameTranslations ? Object.values(node.nameTranslations).some(t => t?.toLowerCase().includes(lowerQuery)) : false;

            if (nameMatch || matchesTranslations) {
                const parentNode = node.parentId ? tree.nodes[node.parentId] : null;
                results.push({
                    treeId: fileId, // Use fileId as the identifier we can load later
                    treeName: tree.treeName,
                    node: node,
                    parentName: parentNode?.name
                });
            }
        });
    });

    return results;
};
