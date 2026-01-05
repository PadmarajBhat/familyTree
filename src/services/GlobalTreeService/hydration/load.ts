import type { TreeDocument, PersonNode } from '../../../logic/types';
import { loadTreeFromSheets, listTreeFiles } from '../../drive';
import { loadedTreesCache } from '../cache';
import { hydrateTree } from './hydrate';

export const loadMainTreeFromSheets = async (spreadsheetId?: string): Promise<TreeDocument | null> => {
    try {
        const { nodes, metadata, summary } = await loadTreeFromSheets(spreadsheetId);
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
            summary: summary || [],
            meta: {
                createdBy: metadata.createdBy || 'Multiple (Sheets)',
                createdTime: metadata.createdTime || new Date().toISOString(),
                nodeCount: nodes.length,
            }
        };

        // Bidirectional consistency: Ensure childrenIds are populated from parentId
        let repaired = 0;
        let disconnected = 0;
        const nodesByName: Record<string, PersonNode> = {};
        Object.values(treeDoc.nodes).forEach(n => { if (n.name) nodesByName[n.name.toLowerCase().trim()] = n; });

        Object.values(treeDoc.nodes).forEach(node => {
            if (node.parentId) {
                let parent = treeDoc.nodes[node.parentId];
                if (!parent) {
                    // Fuzzy match: Maybe the user typed the parent's NAME in the ParentID column
                    parent = nodesByName[node.parentId.toLowerCase().trim()];
                    if (parent) {
                        console.warn(`[Repair] Auto-resolved parent by name for ${node.name}: "${node.parentId}" -> ${parent.nodeId}`);
                        node.parentId = parent.nodeId; // Correct it in memory
                    }
                }

                if (parent) {
                    if (!parent.childrenIds) parent.childrenIds = [];
                    if (!parent.childrenIds.includes(node.nodeId)) {
                        parent.childrenIds.push(node.nodeId);
                        repaired++;
                    }
                } else {
                    if (disconnected < 10) { // Increased limit
                        console.warn(`[Repair Debug] Failed to link '${node.name}' (ID: ${node.nodeId}). Parsed ParentID: '${node.parentId}' - Not found in tree.`);
                    }
                    disconnected++;
                }
            }
        });

        console.log(`[Repair] Summary: Repaired ${repaired} links. ${disconnected} nodes remain disconnected from parents.`);
        if (disconnected > 0 && nodes.length > 1) {
            console.warn(`[Repair] High number of disconnected nodes (${disconnected}/${nodes.length}). Check ParentID column for ID vs Name mismatches.`);
        }

        // Logic Check: Ensure rootNodeId exists in nodes. Fix if missing.
        console.log(`[Load] Initial rootNodeId: ${treeDoc.rootNodeId}`);
        if (!treeDoc.rootNodeId || !treeDoc.nodes[treeDoc.rootNodeId]) {
            console.warn(`[Load] Root node ${treeDoc.rootNodeId} missing or invalid. Searching for orphan...`);
            const orphan = Object.values(treeDoc.nodes).find(n => !n.parentId);
            if (orphan) {
                treeDoc.rootNodeId = orphan.nodeId;
                console.log(`[Load] Found orphan to use as root: ${orphan.name} (${orphan.nodeId})`);
            } else if (nodes.length > 0) {
                treeDoc.rootNodeId = nodes[0].nodeId;
                console.log(`[Load] No orphan found, using first node: ${nodes[0].name}`);
            }
        } else {
            console.log(`[Load] Valid root node confirmed: ${treeDoc.nodes[treeDoc.rootNodeId].name}`);
        }

        // Hydrate before caching and returning
        // We fetch the files list here to support tree name fallback in hydration
        const files = await listTreeFiles();
        hydrateTree(treeDoc, files as any);

        // Cache it
        loadedTreesCache[treeDoc.treeId] = treeDoc;
        return treeDoc;
    } catch (err) {
        console.error("GlobalTreeService: Failed to load tree from Sheets", err);
        return null;
    }
};
