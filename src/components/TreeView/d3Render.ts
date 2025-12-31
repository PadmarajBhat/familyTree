import * as d3 from 'd3';
import type { HierarchyPersonNode, ExtendedHierarchyNode, RenderOptions } from './types';
import { renderNodes } from './d3Nodes';
import { renderLinks, calculateAndRenderJumpLinks } from './d3Links';

export const renderTree = (options: RenderOptions) => {
    const { root, compact } = options;
    const nodeWidth = compact ? 140 : 160;
    const nodeHeight = compact ? 120 : 200;
    const treeLayout = d3.tree<HierarchyPersonNode>().nodeSize([nodeWidth, nodeHeight]);

    // Safe link generator
    const safeLink = d3.linkVertical()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .x((d: any) => (d.x === undefined || isNaN(d.x)) ? 0 : d.x)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .y((d: any) => (d.y === undefined || isNaN(d.y)) ? 0 : d.y) as any;

    const source = root; // Initially root is the source of transition

    const treeData = treeLayout(root);
    const nodes = treeData.descendants() as ExtendedHierarchyNode[];
    const links = treeData.links().filter(l => l.source.data.nodeId !== 'VIRTUAL_ROOT');

    // Render Links
    renderLinks(options, links, source, safeLink);
    calculateAndRenderJumpLinks(options, nodes, links);

    // Render Nodes
    renderNodes(options, nodes, source);

    return { nodes, svg: options.svg };
};
