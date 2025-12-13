import type { TreeDocument, PersonNode } from '../logic/types';
import { listTreeFiles, getFileContent, acquireLock, releaseLock, updateTreeFile } from './drive';
import { getISTTimestamp } from '../logic/dateUtils';

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
    // Register a tree into the cache (e.g. the currently active tree)
    registerTree(fileId: string, tree: TreeDocument): void {
        loadedTreesCache[fileId] = tree;
    },

    // Load all shortlisted trees
    async loadShortlistedTrees(shortlistedIds: string[]): Promise<void> {
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

    /**
     * Get all nodes from all loaded trees as a flat list
     * Useful for building global relationship graphs
     * Returns an array to preserve duplicate nodes (e.g. shadow nodes) from different trees
     */
    getAllNodesFlat(): PersonNode[] {
        const allNodes: PersonNode[] = [];
        Object.values(loadedTreesCache).forEach(tree => {
            Object.values(tree.nodes).forEach(node => {
                allNodes.push(node);
            });
        });
        return allNodes;
    },

    // Get a specific node from cache
    getNode(treeId: string, nodeId: string): PersonNode | null {
        const tree = loadedTreesCache[treeId];
        if (!tree) return null;
        return tree.nodes[nodeId] || null;
    },

    // Live Link Hydration
    // Populates 'Shadow Nodes' (nodes with externalLink) with real data from loaded trees
    hydrateTree(tree: TreeDocument, files: { id: string; name: string }[] = []): void {
        Object.values(tree.nodes).forEach(node => {
            if (node.externalLink) {
                const externalNode = this.getNode(node.externalLink.treeId, node.externalLink.nodeId);
                if (externalNode) {
                    // Update local in-memory node with external details
                    if (externalNode.name) node.name = externalNode.name;
                    if (externalNode.imageUrl) node.imageUrl = externalNode.imageUrl;
                    if (externalNode.dob) node.dob = externalNode.dob;
                    if (externalNode.gender) node.gender = externalNode.gender;
                    if (externalNode.dod) node.dod = externalNode.dod;
                    if (externalNode.education) node.education = externalNode.education;
                    if (externalNode.occupation) node.occupation = externalNode.occupation;
                    if (externalNode.hobbies) node.hobbies = externalNode.hobbies;
                    if (externalNode.location) node.location = externalNode.location;
                    if (externalNode.location) node.location = externalNode.location;
                    if (externalNode.address) node.address = externalNode.address;
                }

                // Hydrate Tree Name for UI (even if externalNode is not loaded)
                if (!node.externalLink.treeName) {
                    const sourceTree = loadedTreesCache[node.externalLink.treeId];
                    if (sourceTree) {
                        node.externalLink.treeName = sourceTree.treeName;
                    } else if (files.length > 0) {
                        const file = files.find(f => f.id === node.externalLink!.treeId);
                        if (file) {
                            node.externalLink.treeName = file.name.split('_')[0];
                        }
                    }
                }
            }
        });
    },

    // Updates a node in a remote tree file with locking
    async updateRemoteNode(treeId: string, nodeId: string, updates: Partial<PersonNode>, userEmail: string): Promise<boolean> {
        console.log(`Attempting to update remote node ${nodeId} in tree ${treeId}`);

        // 1. Acquire Lock
        const lockId = await acquireLock(treeId);
        if (!lockId) {
            console.error(`Could not acquire lock for remote tree ${treeId}`);
            alert(`Could not acquire lock for remote tree. Changes synced to local Shadow Node but NOT source tree.`);
            return false;
        }

        try {
            // 2. Read Latest Content
            const content = await getFileContent(treeId);
            const treeDoc = content as TreeDocument;

            // 3. Find Node
            const node = treeDoc.nodes[nodeId];
            if (!node) {
                console.error("Remote node not found");
                return false;
            }

            // 4. Update allowed fields (Profile Data)
            if (updates.name !== undefined) node.name = updates.name;
            if (updates.gender !== undefined) node.gender = updates.gender;
            if (updates.dob !== undefined) node.dob = updates.dob;
            if (updates.imageUrl !== undefined) node.imageUrl = updates.imageUrl;
            if (updates.dod !== undefined) node.dod = updates.dod;
            if (updates.education !== undefined) node.education = updates.education;
            if (updates.occupation !== undefined) node.occupation = updates.occupation;
            if (updates.hobbies !== undefined) node.hobbies = updates.hobbies;
            if (updates.notes !== undefined) node.notes = updates.notes;
            if (updates.address !== undefined) node.address = updates.address;
            if (updates.location !== undefined) node.location = updates.location;
            if (updates.phone !== undefined) node.phone = updates.phone;
            if (updates.email !== undefined) node.email = updates.email;

            // Metadata
            node.editedBy = userEmail;
            node.editedTime = getISTTimestamp();

            // 5. Save
            await updateTreeFile(treeId, treeDoc, "Live Link Sync Update");
            console.log("Remote tree updated successfully.");

            // 6. Update Cache
            loadedTreesCache[treeId] = treeDoc;
            return true;

        } catch (e) {
            console.error("Error updating remote node", e);
            alert("Error syncing to remote tree. Please check console.");
            return false;
        } finally {
            await releaseLock(lockId);
        }
    },

    /**
     * Scans all available trees to find if the user exists.
     * Prioritizes the tree where the user is an "Original Node" (not a live link).
     */
    async findUserInTrees(email: string): Promise<{ treeId: string; treeName: string } | null> {
        if (!email) return null;
        console.log(`Searching for user ${email} in all trees...`);

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const files = (await listTreeFiles()) as any[];
            if (!files || files.length === 0) return null;

            // Helper to clean tree name
            const getTreeName = (filename: string) => filename.replace('_family_tree.json', '');

            const checkFile = async (file: { id: string; name: string }) => {
                try {
                    // Check cache first
                    let tree = loadedTreesCache[file.id];
                    if (!tree) {
                        const content = await getFileContent(file.id);
                        if (content && typeof content === 'object' && 'nodes' in content) {
                            tree = content as TreeDocument;
                            loadedTreesCache[file.id] = tree; // Cache it
                        }
                    }

                    if (tree && tree.nodes) {
                        // Search nodes
                        const userNode = Object.values(tree.nodes).find(n => n.email === email);
                        if (userNode) {
                            const isOriginal = !userNode.externalLink;
                            console.log(`Found user in tree ${tree.treeName} (${file.id}). Original: ${isOriginal}`);
                            return {
                                treeId: file.id,
                                treeName: tree.treeName || getTreeName(file.name),
                                isOriginal
                            };
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to check tree ${file.name} for user`, e);
                }
                return null;
            };

            const results = await Promise.all(files.map(checkFile));

            // Find best match synchronously from results
            let bestMatch: { treeId: string; treeName: string; isOriginal: boolean } | null = null;

            for (const match of results) {
                if (match) {
                    if (!bestMatch || (match.isOriginal && !bestMatch.isOriginal)) {
                        bestMatch = match;
                    }
                }
            }

            if (bestMatch) {
                return { treeId: bestMatch.treeId, treeName: bestMatch.treeName };
            }

            return null;

        } catch (e) {
            console.error("Error finding user in trees", e);
            return null;
        }
    }
};
