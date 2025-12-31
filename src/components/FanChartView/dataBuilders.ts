import type { TreeDocument } from '../../logic/types';
import type { AncestorNode } from './types';

export const buildAncestorTree = (data: TreeDocument, nodeId: string, generation: number = 0): AncestorNode | null => {
    const node = data.nodes[nodeId];
    if (!node) return null;
    if (generation > 6) return { ...node, generation, children: undefined };

    const parents: AncestorNode[] = [];
    let spouseName = null;
    let spouseImageUrl = null;

    if (node.parentId) {
        const parent1 = buildAncestorTree(data, node.parentId, generation + 1);
        if (parent1) parents.push(parent1);

        const parentNode = data.nodes[node.parentId];
        if (parentNode && parentNode.spouseIds && parentNode.spouseIds.length > 0) {
            const spouseId = parentNode.spouseIds[0];
            const parent2 = buildAncestorTree(data, spouseId, generation + 1);
            if (parent2) parents.push(parent2);
        }
    }

    if (node.spouseIds && node.spouseIds.length > 0) {
        const spouse = data.nodes[node.spouseIds[0]];
        if (spouse) {
            spouseName = spouse.name;
            spouseImageUrl = spouse.imageUrl;
        }
    }

    return { ...node, generation, spouseName, spouseImageUrl, children: parents.length > 0 ? parents : undefined };
};

export const buildDescendantTree = (data: TreeDocument, nodeId: string, generation: number = 0): AncestorNode | null => {
    const node = data.nodes[nodeId];
    if (!node) return null;
    if (generation > 6) return { ...node, generation, children: undefined };

    const children: AncestorNode[] = [];
    let spouseName = null;
    let spouseImageUrl = null;

    if (node.childrenIds) {
        node.childrenIds.forEach(childId => {
            const child = buildDescendantTree(data, childId, generation + 1);
            if (child) children.push(child);
        });
    }

    if (node.spouseIds && node.spouseIds.length > 0) {
        const spouse = data.nodes[node.spouseIds[0]];
        if (spouse) {
            spouseName = spouse.name;
            spouseImageUrl = spouse.imageUrl;
        }
    }

    return { ...node, generation, spouseName, spouseImageUrl, children: children.length > 0 ? children : undefined };
};
