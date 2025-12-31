import { registerTree, getNode, getAllNodesFlat } from './cache';
import { loadShortlistedTrees, searchAllTrees, type SearchResult } from './search';
import { addSpouseToRemoteNode, updateRemoteNode, removeLinksToTree } from './remote';
import { loadMainTreeFromSheets, hydrateTree, findUserInTrees } from './hydration';

export type { SearchResult };

export const GlobalTreeService = {
    // Cache
    registerTree,
    getNode,
    getAllNodesFlat,

    // Search
    loadShortlistedTrees,
    searchAllTrees,

    // Hydration
    loadMainTreeFromSheets,
    hydrateTree,
    findUserInTrees,

    // Remote
    addSpouseToRemoteNode,
    updateRemoteNode,
    removeLinksToTree
};
