import { registerTree, loadShortlistedTrees, getAllNodesFlat, getNode } from './GlobalTree/cache';
import { searchAllTrees, searchBackend } from './GlobalTree/search';
import type { SearchResult } from './GlobalTree/search';
import { hydrateTree } from './GlobalTree/hydration';
import { addSpouseToRemoteNode, updateRemoteNode, removeLinksToTree } from './GlobalTree/mutations';
import { findUserInTrees } from './GlobalTree/user';

export type { SearchResult }; // Re-export type

export const GlobalTreeService = {
    // Cache
    registerTree,
    loadShortlistedTrees,
    getAllNodesFlat,
    getNode,

    // Search
    searchAllTrees,
    searchBackend,

    // Hydration
    hydrateTree,

    // Mutations
    addSpouseToRemoteNode,
    updateRemoteNode,
    removeLinksToTree,

    // User
    findUserInTrees
};
