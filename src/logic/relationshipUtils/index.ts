import type { PersonNode } from '../types';

/**
 * Build an adjacency graph from the family tree nodes
 * Considers parent-child and spouse relationships
 */
/**
 * Build an adjacency graph from the family tree nodes
 * Considers parent-child and spouse relationships
 * Accepts a Record (single tree) or Array (multiple trees)
 */
export function buildGraph(nodes: Record<string, PersonNode> | PersonNode[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);

    // Initialize graph keys ensuring every node has an entry
    nodeList.forEach(node => {
        if (!graph.has(node.nodeId)) {
            graph.set(node.nodeId, new Set<string>());
        }
    });

    // Add edges
    nodeList.forEach(node => {
        // Parent to child
        if (node.parentId) {
            // Ensure parent exists in graph (it should if we have all nodes, but safe to check)
            if (!graph.has(node.parentId)) graph.set(node.parentId, new Set());
            if (!graph.has(node.nodeId)) graph.set(node.nodeId, new Set());

            graph.get(node.parentId)!.add(node.nodeId);
            graph.get(node.nodeId)!.add(node.parentId);
        }

        // Spouse relationships
        node.spouseIds.forEach(spouseId => {
            if (!graph.has(spouseId)) graph.set(spouseId, new Set());
            if (!graph.has(node.nodeId)) graph.set(node.nodeId, new Set());

            graph.get(node.nodeId)!.add(spouseId);
            graph.get(spouseId)!.add(node.nodeId);
        });
    });

    return graph;
}

/**
 * Find the shortest path between two nodes using BFS
 * Returns array of node IDs representing the path, or null if no path exists
 */
export function findPath(
    nodes: Record<string, PersonNode> | PersonNode[],
    fromId: string,
    toId: string
): string[] | null {
    // Basic existence check is harder with list, skipping for efficiency or relying on graph build
    // if (!nodes[fromId] || !nodes[toId]) return null; 

    if (fromId === toId) {
        return [fromId];
    }

    const graph = buildGraph(nodes);

    // Quick check if start/end are in graph
    if (!graph.has(fromId) || !graph.has(toId)) return null;

    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromId, path: [fromId] }];
    const visited = new Set<string>([fromId]);

    while (queue.length > 0) {
        const { nodeId, path } = queue.shift()!;

        const neighbors = graph.get(nodeId) || new Set();
        for (const neighbor of neighbors) {
            if (visited.has(neighbor)) continue;

            const newPath = [...path, neighbor];

            if (neighbor === toId) {
                return newPath;
            }

            visited.add(neighbor);
            queue.push({ nodeId: neighbor, path: newPath });
        }
    }

    return null; // No path found
}

/**
 * Get disambiguation info for a node (parent name)
 */
export function getDisambiguationInfo(
    node: PersonNode,
    nodes: Record<string, PersonNode>
): string {
    if (node.parentId && nodes[node.parentId]) {
        return `Child of ${nodes[node.parentId].name || 'Unknown'}`;
    }
    return 'No parent linked';
}

/**
 * Build a tree structure from a path for rendering
 * This creates a minimal tree that only includes nodes in the path
 * Handles merging of nodes if multiple instances (cross-tree) are provided in the input array.
 */
export function buildPathTree(
    nodes: Record<string, PersonNode> | PersonNode[],
    path: string[]
): { rootId: string; filteredNodes: Record<string, PersonNode> } {
    if (path.length === 0) {
        return { rootId: '', filteredNodes: {} };
    }

    const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
    const mergedMap: Record<string, PersonNode> = {};

    // 1. Merge nodes first to ensure we have full relationship data (cross-tree)
    // We only care about nodes IN the path
    const pathSet = new Set(path);

    path.forEach(nodeId => {
        const instances = nodeList.filter(n => n.nodeId === nodeId);
        if (instances.length === 0) return;

        // Base node - prioritize local version
        const realNode = instances.find(n => !n.externalLink) || instances[0];

        // Merge relationships
        const allChildren = new Set<string>();
        const allSpouses = new Set<string>();
        let parentId = realNode.parentId;

        instances.forEach(inst => {
            inst.childrenIds.forEach(c => allChildren.add(c));
            inst.spouseIds.forEach(s => allSpouses.add(s));
            // If any instance has a parent that is ALSO in the path, use that as parent
            // This is crucial for cross-tree links where parent might be defined in one tree but not another
            if (inst.parentId && pathSet.has(inst.parentId)) {
                parentId = inst.parentId;
            } else if (!parentId && inst.parentId) {
                // Keep valid parent even if not in path (will be filtered later)
                parentId = inst.parentId;
            }
        });

        mergedMap[nodeId] = {
            ...realNode,
            parentId: parentId,
            spouseIds: Array.from(allSpouses),
            childrenIds: Array.from(allChildren)
        };
    });

    // 2. Build Filtered Map (Genealogical Structure)
    // We only include children that are IN the path.
    const filteredNodes: Record<string, PersonNode> = {};
    const localRoots = new Set<string>();

    path.forEach(nodeId => {
        const rawNode = mergedMap[nodeId];
        if (!rawNode) return;

        // Filter children: only keep those that are in the path
        const filteredChildren = rawNode.childrenIds.filter(cid => pathSet.has(cid));

        // Check if parent is in path
        const parentInPath = rawNode.parentId && pathSet.has(rawNode.parentId);

        filteredNodes[nodeId] = {
            ...rawNode,
            childrenIds: filteredChildren,
            // We keep spouse links for visualization if both spouses are in path
            spouseIds: rawNode.spouseIds.filter(sid => pathSet.has(sid)),
            parentId: parentInPath ? rawNode.parentId : null // Remove parent if not in path (making this a local root)
        };

        if (!parentInPath) {
            localRoots.add(nodeId);
        }
    });

    // 3. Determine Root
    let rootId = '';

    // If we have spouse pairs at the top level, we might have multiple local roots that are actually connected horizontally.
    // However, for the tree visualizer, we need a single entry point unless we use a virtual root.

    if (localRoots.size === 1) {
        rootId = Array.from(localRoots)[0];
    } else {
        // Check if the roots are spouses of each other. If so, pick one as primary (usually male or first found).
        const rootsArr = Array.from(localRoots);
        let reducedRoots = [...rootsArr];

        // Simple reduction: if A and B are roots and spouses, remove B (A will show B as spouse)
        // But only if B is NOT already a child of someone else (which it shouldn't be if it's a root)
        for (const rId of rootsArr) {
            const node = filteredNodes[rId];
            if (!node) continue;
            for (const sId of node.spouseIds) {
                if (localRoots.has(sId)) {
                    // They are both roots and spouses.
                    // To avoid double counting, we pick the one that is 'primary' (e.g. alphabetical or node logic)
                    // For now, let's just keep the one that comes first in iteration and remove the other
                    if (reducedRoots.includes(rId) && reducedRoots.includes(sId)) {
                        reducedRoots = reducedRoots.filter(id => id !== sId);
                    }
                }
            }
        }

        if (reducedRoots.length === 1) {
            rootId = reducedRoots[0];
        } else {
            // Truly disjoint roots or multiple family lines (Handshake scenario)
            // Create a Virtual Root
            rootId = 'VIRTUAL_ROOT';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filteredNodes[rootId] = {
                nodeId: rootId,
                name: 'Family Connections',
                gender: 'male',
                parents: [],
                childrenIds: reducedRoots,
                spouseIds: [],
                parentId: null,
                attributes: {},
                treeId: 'virtual'
            } as any;
        }
    }

    return { rootId, filteredNodes };
}

/**
 * Check if a node is an ancestor of another node
 * Returns true if potentialAncestorId is an ancestor of nodeId
 */
export function isAncestor(
    nodeId: string,
    potentialAncestorId: string,
    nodes: Record<string, PersonNode>
): boolean {
    if (!nodeId || !potentialAncestorId || !nodes[nodeId]) return false;
    if (nodeId === potentialAncestorId) return true; // Self is considered ancestor in this context (cycle)

    let current = nodes[nodeId];
    while (current && current.parentId) {
        if (current.parentId === potentialAncestorId) {
            return true;
        }
        // Cycle protection in traversal
        if (current.parentId === nodeId) break;

        current = nodes[current.parentId];
    }
    return false;
}
