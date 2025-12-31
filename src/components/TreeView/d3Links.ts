import * as d3 from 'd3';
import type { ExtendedHierarchyNode, HierarchyPersonNode, RenderOptions } from './types';

// Safe link generator type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SafeLinkFn = d3.Link<any, any, any>;

export const renderLinks = (
    options: RenderOptions,
    links: d3.HierarchyPointLink<HierarchyPersonNode>[],
    source: ExtendedHierarchyNode,
    safeLink: SafeLinkFn
) => {
    const { g } = options;

    // --- Standard Links ---
    const link = g.selectAll<SVGPathElement, d3.HierarchyPointLink<HierarchyPersonNode>>(".link")
        .data(links, (d) => d.target.data.nodeId);

    const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", () => {
            const o = { x: source.x0 || 0, y: source.y0 || 0 };
            return safeLink({ source: o, target: o });
        })
        .style("fill", "none")
        .style("stroke", "#ccc")
        .style("stroke-width", "2px");

    linkEnter.merge(link).transition().duration(200).attr("d", safeLink);

    link.exit().transition().duration(200)
        .attr("d", () => {
            const o = { x: source.x || 0, y: source.y || 0 };
            return safeLink({ source: o, target: o });
        })
        .remove();

    // --- Custom Jump Links (Green Lines) ---
    // We need 'nodes' to calculate jump links, but we can't easily pass it here without recalcing logic. 
    // Wait, the jumpLinks logic in d3Render.ts depended on `nodes`. 
    // We should probably pass the calculated jumpLinks or the nodes to this function.
    // Let's pass the pre-calculated jump links for cleaner separation of concern, 
    // or pass 'nodes' and logic here. Passing 'nodes' is better so we encapsulate logic.
};

export const calculateAndRenderJumpLinks = (
    options: RenderOptions,
    nodes: ExtendedHierarchyNode[],
    links: d3.HierarchyPointLink<HierarchyPersonNode>[]
) => {
    const { g, path } = options;
    const jumpLinks: { source: { x: number, y: number }, target: { x: number, y: number } }[] = [];

    if (path && path.length > 1) {
        const nodeMap = new Map<string, ExtendedHierarchyNode>();
        nodes.forEach(n => nodeMap.set(n.data.nodeId, n));

        for (let i = 0; i < path.length - 1; i++) {
            const uId = path[i];
            const vId = path[i + 1];
            const u = nodeMap.get(uId);
            const v = nodeMap.get(vId);

            if (u && v && u.x !== undefined && u.y !== undefined && v.x !== undefined && v.y !== undefined) {
                const isConnected = links.some(l =>
                    (l.source.data.nodeId === uId && l.target.data.nodeId === vId) ||
                    (l.source.data.nodeId === vId && l.target.data.nodeId === uId)
                );

                if (!isConnected) {
                    jumpLinks.push({
                        source: { x: u.x, y: u.y },
                        target: { x: v.x, y: v.y }
                    });
                }
            }
        }
    }

    const jumpLink = g.selectAll<SVGPathElement, typeof jumpLinks[0]>(".jump-link")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .data(jumpLinks, (d: any) => `${d.source.x}-${d.source.y}-${d.target.x}-${d.target.y}`);

    const jumpLinkEnter = jumpLink.enter().insert("path", "g")
        .attr("class", "jump-link")
        .attr("d", (d) => {
            return d3.linkHorizontal()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .x((pt: any) => pt.x)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .y((pt: any) => pt.y)
                ({ source: d.source, target: d.target });
        })
        .style("fill", "none")
        .style("stroke", "#2ecc71") // Green
        .style("stroke-width", "3px")
        .style("stroke-dasharray", "5,5");

    jumpLink.merge(jumpLinkEnter)
        .transition().duration(200)
        .attr("d", (d) => {
            return `M${d.source.x},${d.source.y} Q${(d.source.x + d.target.x) / 2},${d.target.y + 100} ${d.target.x},${d.target.y}`;
        });

    jumpLink.exit().remove();
};
