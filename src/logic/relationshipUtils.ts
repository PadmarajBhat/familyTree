import type { PersonNode } from './types';

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
    path.forEach(nodeId => {
        const instances = nodeList.filter(n => n.nodeId === nodeId);
        if (instances.length === 0) return;

        // Base node
        const realNode = instances.find(n => !n.externalLink) || instances[0];

        // Merge relationships
        const allChildren = new Set<string>();
        const allSpouses = new Set<string>();
        let parentId = realNode.parentId;

        instances.forEach(inst => {
            inst.childrenIds.forEach(c => allChildren.add(c));
            inst.spouseIds.forEach(s => allSpouses.add(s));
            if (inst.parentId) parentId = inst.parentId;
        });

        mergedMap[nodeId] = {
            ...realNode,
            parentId: parentId,
            spouseIds: Array.from(allSpouses),
            childrenIds: Array.from(allChildren)
        };
    });

    const filteredNodes: Record<string, PersonNode> = {};

    // 2. Build Linear Visual Chain
    // We treat the path as a linear tree: path[0] -> path[1] -> ... -> path[n]
    for (let i = 0; i < path.length; i++) {
        const nodeId = path[i];
        const rawNode = mergedMap[nodeId];
        if (!rawNode) continue;

        // Clone and strip relationships for visual clarity
        // We will manually link them via childrenIds in the chain
        filteredNodes[nodeId] = {
            ...rawNode,
            childrenIds: [],
            spouseIds: [],
            parentId: i > 0 ? path[i - 1] : null // Set parent to previous node in path for consistency
        };

        // Link to next node in path
        if (i < path.length - 1) {
            filteredNodes[nodeId].childrenIds = [path[i + 1]];
        }

        // Add relationship label to the name (except for root)
        if (i > 0) {
            const prevId = path[i - 1];
            const prevRaw = mergedMap[prevId];

            let rel = 'Related';

            // Check biological relationship
            if (prevRaw.spouseIds.includes(nodeId) || rawNode.spouseIds.includes(prevId)) {
                rel = 'Spouse';
            } else if (prevRaw.childrenIds.includes(nodeId)) {
                rel = rawNode.gender === 'female' ? 'Daughter' : 'Son';
            } else if (rawNode.childrenIds.includes(prevId)) { // If current is parent of previous
                rel = rawNode.gender === 'female' ? 'Mother' : 'Father';
            } else if (prevRaw.parentId === nodeId) {
                rel = rawNode.gender === 'female' ? 'Mother' : 'Father';
            }

            // Add label
            filteredNodes[nodeId].name = `${rawNode.name} (${rel})`;
        } else {
            // Root node
            filteredNodes[nodeId].name = `${rawNode.name} (Start)`;
        }
    }

    return { rootId: path[0], filteredNodes };
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
