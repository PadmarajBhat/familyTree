import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { TreeDocument } from '../logic/types';

interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
}

interface ExtendedHierarchyNode extends d3.HierarchyNode<any> {
    _children?: ExtendedHierarchyNode[] | null | undefined;
    x0?: number;
    y0?: number;
}

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!data || !svgRef.current || !wrapperRef.current) return;

        const width = wrapperRef.current.clientWidth;
        const height = wrapperRef.current.clientHeight;

        // Clear previous
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .call(d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
                g.attr("transform", event.transform);
            }) as any);

        const g = svg.append("g");

        // --- Build Hierarchy with Descendant Count ---
        const buildHierarchy = (nodeId: string): any => {
            const node = data.nodes[nodeId];
            if (!node) return null;

            const children = node.childrenIds
                .map(buildHierarchy)
                .filter((n): n is any => n !== null);

            // Calculate descendant count
            const descendantCount = children.reduce((acc, child) => acc + 1 + (child.descendantCount || 0), 0);

            return {
                ...node,
                children: children.length > 0 ? children : undefined,
                descendantCount: descendantCount
            };
        };

        const hierarchyData = buildHierarchy(data.rootNodeId);
        if (!hierarchyData) return;

        const root = d3.hierarchy(hierarchyData) as ExtendedHierarchyNode;
        root.x0 = width / 2;
        root.y0 = 0;

        const treeLayout = d3.tree<any>().nodeSize([120, 180]); // Increased spacing

        const update = (source: ExtendedHierarchyNode) => {
            const treeData = treeLayout(root);
            const nodes = treeData.descendants() as ExtendedHierarchyNode[];
            const links = treeData.links();

            // --- Nodes ---
            const node = g.selectAll<SVGGElement, ExtendedHierarchyNode>(".node")
                .data(nodes, (d) => d.data.nodeId);

            const nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", (_d) => `translate(${source.x0},${source.y0})`)
                .on("click", (_event, d) => {
                    // Toggle children on click
                    if (d.children) {
                        d._children = d.children;
                        d.children = undefined;
                    } else {
                        d.children = d._children || undefined;
                        d._children = undefined;
                    }
                    update(d);
                })
                .on("dblclick", (event, d) => {
                    event.stopPropagation(); // Prevent zoom double click
                    onNodeClick(d.data.nodeId);
                });

            // Profile Picture (Circle with Pattern)
            nodeEnter.each(function (d) {
                const patternId = `pattern-${d.data.nodeId}`;
                const imageUrl = d.data.imageUrl;

                if (imageUrl) {
                    d3.select(this).append("defs")
                        .append("pattern")
                        .attr("id", patternId)
                        .attr("height", "100%")
                        .attr("width", "100%")
                        .attr("patternContentUnits", "objectBoundingBox")
                        .append("image")
                        .attr("height", 1)
                        .attr("width", 1)
                        .attr("preserveAspectRatio", "none")
                        .attr("href", imageUrl);
                }
            });

            nodeEnter.append("circle")
                .attr("class", "node-circle")
                .attr("r", 30)
                .style("fill", (d) => d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                .style("stroke", "steelblue")
                .style("stroke-width", "3px")
                .style("cursor", "pointer");

            // Descendant Count Badge
            const badgeGroup = nodeEnter.append("g")
                .attr("class", "badge")
                .attr("transform", "translate(20, -20)")
                .style("display", (d) => (d.data.descendantCount || 0) > 0 ? "block" : "none");

            badgeGroup.append("circle")
                .attr("r", 10)
                .style("fill", "red")
                .style("stroke", "white");

            badgeGroup.append("text")
                .attr("dy", ".35em")
                .style("text-anchor", "middle")
                .style("fill", "white")
                .style("font-size", "10px")
                .style("font-weight", "bold")
                .text((d) => d.data.descendantCount);

            // Name Label
            nodeEnter.append("text")
                .attr("dy", ".35em")
                .attr("y", 45)
                .style("text-anchor", "middle")
                .text((d) => d.data.name || "Unknown")
                .style("font-size", "12px")
                .style("fill", "#333")
                .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

            // Transition nodes to their new position
            const nodeUpdate = nodeEnter.merge(node);

            nodeUpdate.transition()
                .duration(200)
                .attr("transform", (d) => `translate(${d.x},${d.y})`);

            nodeUpdate.select("circle.node-circle")
                .style("fill", (d) => d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : (d._children ? "lightsteelblue" : "#fff"));

            // Transition exiting nodes
            const nodeExit = node.exit().transition()
                .duration(200)
                .attr("transform", (_d) => `translate(${source.x},${source.y})`)
                .remove();

            nodeExit.select("circle")
                .attr("r", 1e-6);

            // --- Links ---
            const link = g.selectAll<SVGPathElement, any>(".link")
                .data(links, (d: any) => d.target.data.nodeId);

            const linkEnter = link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", (_d) => {
                    const o = { x: source.x0 || 0, y: source.y0 || 0 };
                    return d3.linkVertical()({ source: o, target: o } as any);
                })
                .style("fill", "none")
                .style("stroke", "#ccc")
                .style("stroke-width", "2px");

            const linkUpdate = linkEnter.merge(link);

            linkUpdate.transition()
                .duration(200)
                .attr("d", d3.linkVertical()
                    .x((d: any) => d.x)
                    .y((d: any) => d.y) as any
                );

            link.exit().transition()
                .duration(200)
                .attr("d", (_d) => {
                    const o = { x: source.x || 0, y: source.y || 0 };
                    return d3.linkVertical()({ source: o, target: o } as any);
                })
                .remove();

            // Store the old positions for transition
            nodes.forEach((d) => {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        };

        // Initial update
        update(root);

        // Center initially
        const initialTransform = d3.zoomIdentity.translate(width / 2, 50).scale(1);
        svg.call(d3.zoom().transform as any, initialTransform);

    }, [data]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9' }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
