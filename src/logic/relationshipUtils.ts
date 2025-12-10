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

    const pathSet = new Set(path);
    const filteredNodes: Record<string, PersonNode> = {};
    const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);

    // Create filtered nodes. We must merge data if multiple nodes share the same ID.
    // This ensures that if Node A is in Tree 1 (with child B) and Tree 2 (with parent C),
    // the merged node has both child B and parent C.
    path.forEach(nodeId => {
        // Find all instances of this node
        const instances = nodeList.filter(n => n.nodeId === nodeId);
        if (instances.length === 0) return;

        // Base node: prefer the one that is NOT an external link (real node), or just the first one
        const realNode = instances.find(n => !n.externalLink) || instances[0];

        // Merge relationships
        const allChildren = new Set<string>();
        const allSpouses = new Set<string>();
        let parentId = realNode.parentId;

        instances.forEach(inst => {
            inst.childrenIds.forEach(c => allChildren.add(c));
            inst.spouseIds.forEach(s => allSpouses.add(s));
            // Improve parent finding? If one has parent and other doesn't?
            if (inst.parentId) parentId = inst.parentId;
        });

        filteredNodes[nodeId] = {
            ...realNode,
            parentId: parentId,
            spouseIds: Array.from(allSpouses).filter(id => pathSet.has(id)),
            // Only include children that are in the path
            childrenIds: Array.from(allChildren).filter(childId => pathSet.has(childId))
        };
    });

    // Find the root (the node with no parent in the path, or the actual root)
    let rootId = path[0];
    for (const nodeId of path) {
        const node = filteredNodes[nodeId];
        // If node has no parent, OR its parent is not in the path -> It's a root candidate for this view
        if (!node.parentId || !pathSet.has(node.parentId)) {
            rootId = nodeId;
            break;
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
