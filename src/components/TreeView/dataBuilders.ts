import type { TreeDocument } from '../../logic/types';
import type { HierarchyPersonNode } from './types';

export const buildHierarchy = (
    data: TreeDocument,
    nodeId: string,
    visited: Set<string> = new Set()
): HierarchyPersonNode | null => {
    const node = data.nodes[nodeId];
    if (!node) {
        if (visited.size === 0) console.warn(`[Hierarchy] Root node ${nodeId} not found in data.nodes!`);
        return null;
    }

    if (visited.size === 0) {
        console.log(`[Hierarchy] Building tree from root: ${node.name} (${nodeId}). Total nodes in tree: ${Object.keys(data.nodes).length}`);
        console.log(`[Hierarchy] Root childrenIds:`, node.childrenIds);
    }

    if (visited.has(nodeId)) {
        // Cycle detected or multi-parent path (e.g. pedigree collapse)
        // For a strict tree, we stop.
        return null;
    }
    visited.add(nodeId);

    // Aggregate children from current node AND its spouses
    const allChildrenIds = new Set(node.childrenIds);
    node.spouseIds.forEach(spId => {
        const spNode = data.nodes[spId];
        if (spNode && spNode.childrenIds) {
            // If spouse is a shadow node, its children were hydrated by GlobalTreeService
            spNode.childrenIds.forEach(childId => allChildrenIds.add(childId));
        }
    });

    const children: HierarchyPersonNode[] = Array.from(allChildrenIds)
        .map(childId => {
            const childNode = buildHierarchy(data, childId, new Set(visited));
            if (!childNode && data.nodes[childId]) {
                console.warn(`[Hierarchy] Child ${childId} of ${node.name} failed to build (likely a cycle).`);
            } else if (!childNode) {
                console.warn(`[Hierarchy] Child ${childId} of ${node.name} not found in nodes!`);
            }
            return childNode;
        })
        .filter((n): n is HierarchyPersonNode => n !== null);

    if (visited.size === 1) { // Immediate children of root
        console.log(`[Hierarchy] Resolved ${children.length} immediate children for root.`);
    }

    // Sort children by Age (DOB) if available
    children.sort((a, b) => {
        const dobA = a.dob;
        const dobB = b.dob;
        if (dobA && dobB) {
            // Input is typically DD-MM-YYYY in our app, need consistent parsing
            // But if it's stored as ISO in types.ts comment but DD-MM-YYYY in practice...
            // Let's assume standard format for now.
            const partsA = dobA.split('-').reverse().join('');
            const partsB = dobB.split('-').reverse().join('');
            return partsA.localeCompare(partsB);
        }
        return 0;
    });

    return {
        ...node,
        children: children.length > 0 ? children : undefined,
        childrenCount: children.length // Recalculate based on filtered/sorted children
    };
};
