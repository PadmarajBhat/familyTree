import type { TreeDocument } from '../../logic/types';
import type { HierarchyPersonNode } from './types';

export const buildHierarchy = (
    data: TreeDocument,
    nodeId: string,
    visited: Set<string> = new Set()
): HierarchyPersonNode | null => {
    const node = data.nodes[nodeId];
    if (!node) return null;

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
        .map(childId => buildHierarchy(data, childId, new Set(visited)))
        .filter((n): n is HierarchyPersonNode => n !== null);

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
