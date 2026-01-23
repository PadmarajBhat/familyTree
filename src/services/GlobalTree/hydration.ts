import type { TreeDocument, PersonNode } from '../../logic/types';
import { loadedTreesCache, getNode } from './cache';

// Live Link Hydration
// Populates 'Shadow Nodes' (nodes with externalLink) with real data from loaded trees
export function hydrateTree(tree: TreeDocument, files: { id: string; name: string }[] = []): void {
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
}
