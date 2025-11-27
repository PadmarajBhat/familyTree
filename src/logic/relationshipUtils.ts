import type { PersonNode } from './types';

/**
 * Build an adjacency graph from the family tree nodes
 * Considers parent-child and spouse relationships
 */
export function buildGraph(nodes: Record<string, PersonNode>): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph
    Object.keys(nodes).forEach(nodeId => {
        graph.set(nodeId, new Set<string>());
    });

    // Add edges for parent-child relationships (bidirectional)
    Object.values(nodes).forEach(node => {
        // Parent to child
        if (node.parentId && graph.has(node.parentId)) {
            graph.get(node.parentId)!.add(node.nodeId);
            graph.get(node.nodeId)!.add(node.parentId);
        }

        // Spouse relationships
        node.spouseIds.forEach(spouseId => {
            if (graph.has(spouseId)) {
                graph.get(node.nodeId)!.add(spouseId);
                graph.get(spouseId)!.add(node.nodeId);
            }
        });
    });

    return graph;
}

/**
 * Find the shortest path between two nodes using BFS
 * Returns array of node IDs representing the path, or null if no path exists
 */
export function findPath(
    nodes: Record<string, PersonNode>,
    fromId: string,
    toId: string
): string[] | null {
    if (!nodes[fromId] || !nodes[toId]) {
        return null;
    }

    if (fromId === toId) {
        return [fromId];
    }

    const graph = buildGraph(nodes);
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
 */
export function buildPathTree(
    nodes: Record<string, PersonNode>,
    path: string[]
): { rootId: string; filteredNodes: Record<string, PersonNode> } {
    if (path.length === 0) {
        return { rootId: '', filteredNodes: {} };
    }

    const pathSet = new Set(path);
    const filteredNodes: Record<string, PersonNode> = {};

    // Create filtered nodes with only relevant children
    path.forEach(nodeId => {
        const node = nodes[nodeId];
        if (!node) return;

        filteredNodes[nodeId] = {
            ...node,
            // Only include children that are in the path
            childrenIds: node.childrenIds.filter(childId => pathSet.has(childId))
        };
    });

    // Find the root (the node with no parent in the path, or the actual root)
    let rootId = path[0];
    for (const nodeId of path) {
        const node = filteredNodes[nodeId];
        if (!node.parentId || !pathSet.has(node.parentId)) {
            rootId = nodeId;
            break;
        }
    }

    return { rootId, filteredNodes };
}
