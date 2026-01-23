import { listTreeFiles, getFileContent } from '../drive';
import { loadedTreesCache } from './cache';
import type { TreeDocument } from '../../logic/types';

// Scans all available trees to find if the user exists.
// Prioritizes the tree where the user is an "Original Node" (not a live link).
export async function findUserInTrees(email: string): Promise<{ treeId: string; treeName: string } | null> {
    if (!email) return null;
    console.log(`Searching for user ${email} in all trees...`);

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const files = (await listTreeFiles()) as any[];
        if (!files || files.length === 0) return null;

        // Helper to clean tree name
        const getTreeName = (filename: string) => filename.replace('_family_tree.json', '');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    const userNode = Object.values(tree.nodes).find(n => n.email?.trim().toLowerCase() === email.trim().toLowerCase());
                    const isCreator = tree.meta?.createdBy?.trim().toLowerCase() === email.trim().toLowerCase();

                    if (userNode || isCreator) {
                        const isOriginal = userNode ? !userNode.externalLink : true;
                        console.log(`Found user in tree ${tree.treeName} (${file.id}). Original: ${isOriginal}, Creator: ${isCreator}`);
                        return {
                            treeId: file.id,
                            treeName: tree.treeName || getTreeName(file.name),
                            isOriginal
                        };
                    }
                } else {
                    console.warn(`Tree content missing or invalid for file: ${file.name} (${file.id})`);
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
