import type { TreeDocument, PersonNode } from '../../logic/types';
import { loadTreeFromSheets, listTreeFiles, getFileContent } from '../drive';
import { loadedTreesCache, getNode } from './cache';

export const loadMainTreeFromSheets = async (): Promise<TreeDocument | null> => {
    try {
        const { nodes, metadata } = await loadTreeFromSheets();
        if (nodes.length === 0) return null;

        // Convert flat array to record
        const nodesRecord: Record<string, PersonNode> = {};
        nodes.forEach(n => nodesRecord[n.nodeId] = n);

        const treeDoc: TreeDocument = {
            schemaVersion: metadata.schemaVersion ? parseInt(metadata.schemaVersion) : 1,
            treeId: metadata.treeId || 'sheets_main',
            treeName: metadata.treeName || 'Main Family Tree',
            versionIndex: metadata.versionIndex ? parseInt(metadata.versionIndex) : 0,
            timestamp: metadata.timestamp || new Date().toISOString(),
            rootNodeId: metadata.rootNodeId || (nodes.length > 0 ? nodes[0].nodeId : ''),
            nodes: nodesRecord,
            marriages: [],
            summary: [],
            meta: {
                createdBy: metadata.createdBy || 'Multiple (Sheets)',
                createdTime: metadata.createdTime || new Date().toISOString(),
                nodeCount: nodes.length,
            }
        };

        // Logic Check: Ensure rootNodeId exists in nodes. Fix if missing.
        if (treeDoc.rootNodeId && !treeDoc.nodes[treeDoc.rootNodeId]) {
            const orphan = nodes.find(n => !n.parentId);
            if (orphan) {
                treeDoc.rootNodeId = orphan.nodeId;
            } else if (nodes.length > 0) {
                treeDoc.rootNodeId = nodes[0].nodeId;
            }
        }

        // Cache it
        loadedTreesCache[treeDoc.treeId] = treeDoc;
        return treeDoc;
    } catch (err) {
        console.error("GlobalTreeService: Failed to load tree from Sheets", err);
        return null;
    }
};

// Live Link Hydration
// Populates 'Shadow Nodes' (nodes with externalLink) with real data from loaded trees
export const hydrateTree = (tree: TreeDocument, files: { id: string; name: string }[] = []): void => {
    const nodesToAdd: Record<string, PersonNode> = {};

    Object.values(tree.nodes).forEach(node => {
        if (node.externalLink) {
            const sourceTreeId = node.externalLink.treeId;
            const sourceNodeId = node.externalLink.nodeId;
            const externalNode = getNode(sourceTreeId, sourceNodeId);

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
                if (externalNode.address) node.address = externalNode.address;

                // NEW: Hydrate Relationships for Cross-Tree Rendering
                if (externalNode.childrenIds) {
                    const mergedChildren = new Set([...node.childrenIds, ...externalNode.childrenIds]);
                    node.childrenIds = Array.from(mergedChildren);

                    // INJECT MISSING CHILDREN:
                    // If the shadow node has children that are NOT in the current tree, we must create shadow nodes for them
                    // so the renderer can display them.
                    externalNode.childrenIds.forEach(childId => {
                        if (!tree.nodes[childId] && !nodesToAdd[childId]) {
                            const childNodeRemote = getNode(sourceTreeId, childId);
                            if (childNodeRemote) {
                                // Create a transient shadow node for this child
                                nodesToAdd[childId] = {
                                    ...childNodeRemote, // Copy all data (name, dob, gender, etc.)
                                    nodeId: childId,    // Keep same ID
                                    spouseIds: childNodeRemote.spouseIds || [],
                                    childrenIds: childNodeRemote.childrenIds || [],
                                    externalLink: {
                                        treeId: sourceTreeId,
                                        nodeId: childId,
                                        treeName: node.externalLink?.treeName // Inherit tree name
                                    },
                                    // Ensure parentId is meaningful? 
                                    // In local tree, parent is 'node.nodeId'.
                                    parentId: node.nodeId
                                };
                            }
                        }
                    });
                }
                if (externalNode.spouseIds) {
                    const mergedSpouses = new Set([...node.spouseIds, ...externalNode.spouseIds]);
                    node.spouseIds = Array.from(mergedSpouses);

                    // INJECT MISSING SPOUSES:
                    // Ensure the spouse B is visible when A is linked.
                    externalNode.spouseIds.forEach(spId => {
                        if (!tree.nodes[spId] && !nodesToAdd[spId]) {
                            const spNodeRemote = getNode(sourceTreeId, spId);
                            if (spNodeRemote) {
                                nodesToAdd[spId] = {
                                    ...spNodeRemote,
                                    nodeId: spId,
                                    // Keep original relationships for context, though they might not all resolve
                                    spouseIds: spNodeRemote.spouseIds || [],
                                    childrenIds: spNodeRemote.childrenIds || [],
                                    externalLink: {
                                        treeId: sourceTreeId,
                                        nodeId: spId,
                                        treeName: node.externalLink?.treeName
                                    },
                                    parentId: spNodeRemote.parentId
                                };
                            }
                        }
                    });
                }
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

    // Merge injected nodes
    if (Object.keys(nodesToAdd).length > 0) {
        Object.assign(tree.nodes, nodesToAdd);
        console.log(`Injected ${Object.keys(nodesToAdd).length} missing child shadow nodes.`);
    }
};

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
};
