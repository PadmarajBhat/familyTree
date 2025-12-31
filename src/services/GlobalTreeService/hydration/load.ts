import type { TreeDocument, PersonNode } from '../../../logic/types';
import { loadTreeFromSheets } from '../../drive';
import { loadedTreesCache } from '../cache';

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
