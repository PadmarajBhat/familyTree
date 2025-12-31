import type { PersonNode } from '../../../logic/types';
import { loadTreeFromSheets, listTreeFiles } from '../../drive';
import { loadedTreesCache } from '../cache';

/**
 * Scans all available trees to find if the user exists.
 * Prioritizes the tree where the user is an "Original Node" (not a live link).
 */
export const findUserInTrees = async (email: string): Promise<{ treeId: string; treeName: string } | null> => {
    if (!email) return null;
    console.log(`Searching for user ${email} in all trees...`);

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const files = (await listTreeFiles()) as any[];
        if (!files || files.length === 0) return null;

        // Helper to clean tree name
        const getTreeName = (filename: string) => filename.replace('_family_tree.json', '');

        const checkFile = async (file: any) => {
            try {
                // Check cache first
                let tree = loadedTreesCache[file.id];
                if (!tree) {
                    const { nodes, metadata, summary } = await loadTreeFromSheets(file.id);
                    // Convert to TreeDocument structure
                    const nodesRecord: Record<string, PersonNode> = {};
                    nodes.forEach(n => nodesRecord[n.nodeId] = n);

                    tree = {
                        schemaVersion: 1,
                        treeId: metadata.treeId || file.id,
                        treeName: metadata.treeName || getTreeName(file.name),
                        versionIndex: 0,
                        timestamp: new Date().toISOString(),
                        rootNodeId: metadata.rootNodeId || (nodes.length > 0 ? nodes[0].nodeId : ''),
                        nodes: nodesRecord,
                        marriages: [],
                        summary: summary || [],
                        meta: { createdBy: metadata.createdBy || file.owners?.[0]?.emailAddress || 'Sheets', createdTime: new Date().toISOString(), nodeCount: nodes.length }
                    };
                    loadedTreesCache[file.id] = tree;
                }

                if (tree && tree.nodes) {
                    // Search nodes
                    console.log(`[Debug] Searching for ${email} in tree ${tree.treeName}. Node count: ${Object.keys(tree.nodes).length}`);
                    const userNode = Object.values(tree.nodes).find(n => {
                        const nodeEmail = n.email?.trim().toLowerCase();
                        const searchEmail = email.trim().toLowerCase();
                        if (nodeEmail && nodeEmail.includes("padmaraj")) {
                            console.log(`[Debug] Checking node ${n.name}: '${nodeEmail}' vs '${searchEmail}'`);
                        }
                        return nodeEmail === searchEmail;
                    });
                    const isCreator = (tree.meta?.createdBy?.trim().toLowerCase() === email.trim().toLowerCase()) ||
                        (file.owners?.[0]?.emailAddress?.trim().toLowerCase() === email.trim().toLowerCase());

                    if (userNode || isCreator) {
                        const isOriginal = userNode ? !userNode.externalLink : true;
                        console.log(`Found user in tree ${tree.treeName} (${file.id}). Original: ${isOriginal}, Creator: ${isCreator}`);
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
};
