import type { TreeDocument, PersonNode } from '../logic/types';
import { listTreeFiles, getFileContent } from './drive';

// A cache for loaded trees to avoid re-fetching constantly
// Key: treeId, Value: TreeDocument
const loadedTreesCache: Record<string, TreeDocument> = {};

export interface SearchResult {
    treeId: string;
    treeName: string;
    node: PersonNode;
    parentName?: string | null;
}

export const GlobalTreeService = {
    // Load all shortlisted trees
    async loadShortlistedTrees(shortlistedIds: string[]): Promise<void> {
        // We only load what is not already in cache or if forced?
        // For simplicity, let's checking timestamp could be expensive.
        // Let's rely on basic caching for this session.
        if (shortlistedIds.length === 0) return;

        console.log("GlobalTreeService: Loading trees...", shortlistedIds);

        // We need to map file IDs to TreeDocuments. 
        // Note: listTreeFiles returns metadata.
        const files = await listTreeFiles();

        const promises = shortlistedIds.map(async (fileId) => {
            if (loadedTreesCache[fileId]) return; // Already loaded

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileMeta = files.find((f: any) => f.id === fileId);
            if (!fileMeta) return;

            try {
                const content = await getFileContent(fileId);
                if (content && typeof content === 'object' && 'nodes' in content) {
                    loadedTreesCache[fileMeta.id] = content as TreeDocument;
                    // Also store by treeId if needed, but fileId is safer for retreival
                }
            } catch (e) {
                console.error(`Failed to load tree ${fileId}`, e);
            }
        });

        await Promise.all(promises);
    },

    // Unified Search
    searchAllTrees(query: string): SearchResult[] {
        const results: SearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        Object.entries(loadedTreesCache).forEach(([fileId, tree]) => {
            Object.values(tree.nodes).forEach(node => {
                const nameMatch = node.name?.toLowerCase().includes(lowerQuery) || false;
                if (nameMatch) {
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
    },

    // Get a specific node from cache
    getNode(treeId: string, nodeId: string): PersonNode | null {
        const tree = loadedTreesCache[treeId];
        if (!tree) return null;
        return tree.nodes[nodeId] || null;
    }
};
