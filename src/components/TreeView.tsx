import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { TreeDocument, PersonNode } from '../logic/types';

interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
    maxDepth?: number | null;
}

interface HierarchyPersonNode extends PersonNode {
    children?: HierarchyPersonNode[];
    descendantCount?: number;
    descendantIds?: Set<string>;
}

interface ExtendedHierarchyNode extends d3.HierarchyNode<HierarchyPersonNode> {
    _children?: ExtendedHierarchyNode[] | null | undefined;
    x0?: number;
    y0?: number;
}

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, maxDepth }) => {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any);

        const g = svg.append("g");

        // --- Build Hierarchy with Descendant Count ---
        // --- Build Hierarchy with Descendant Count ---
        const buildHierarchy = (nodeId: string, path: Set<string> = new Set()): HierarchyPersonNode | null => {
            // Cycle detection
            if (path.has(nodeId)) return null;
            const newPath = new Set(path).add(nodeId);

            const node = data.nodes[nodeId];
            if (!node) return null;

            const children = node.childrenIds
                .map(childId => buildHierarchy(childId, newPath))
                .filter((n): n is HierarchyPersonNode => n !== null);

            // Calculate unique descendant IDs
            const allDescendantIds = new Set<string>();
            children.forEach(child => {
                allDescendantIds.add(child.nodeId);
                if (child.descendantIds) {
                    child.descendantIds.forEach(id => allDescendantIds.add(id));
                }
            });

            return {
                ...node,
                children: children.length > 0 ? children : undefined,
                descendantCount: allDescendantIds.size,
                descendantIds: allDescendantIds
            };
        };

        const hierarchyData = buildHierarchy(data.rootNodeId);
        if (!hierarchyData) return;

        const root = d3.hierarchy(hierarchyData) as ExtendedHierarchyNode;
        root.x0 = width / 2;
        root.y0 = 0;

        // Apply maxDepth if specified
        if (maxDepth) {
            root.descendants().forEach((d) => {
                if (d.depth >= maxDepth) {
                    if (d.children) {
                        d._children = d.children;
                        d.children = undefined;
                    }
                } else {
                    // Ensure expanded if within depth (in case of re-render with different depth)
                    if (d._children) {
                        d.children = d._children;
                        d._children = undefined;
                    }
                }
            });
        }

        const treeLayout = d3.tree<HierarchyPersonNode>().nodeSize([120, 180]); // Increased spacing

        const update = (source: ExtendedHierarchyNode) => {
            const treeData = treeLayout(root);
            const nodes = treeData.descendants() as ExtendedHierarchyNode[];
            const links = treeData.links();

            // --- Nodes ---
            const node = g.selectAll<SVGGElement, ExtendedHierarchyNode>(".node")
                .data(nodes, (d) => d.data.nodeId);

            const nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", () => `translate(${source.x0},${source.y0})`);

            // Main Click Area (Profile Pic) -> Open Details
            const mainGroup = nodeEnter.append("g")
                .style("cursor", "pointer")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    onNodeClick(d.data.nodeId);
                });

            // Profile Picture (Circle with Pattern)
            mainGroup.each(function (d) {
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

            mainGroup.append("circle")
                .attr("class", "node-circle")
                .attr("r", 30)
                .style("fill", (d) => d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                .style("stroke", "steelblue")
                .style("stroke-width", "3px");

            // Descendant Count Badge
            const badgeGroup = mainGroup.append("g")
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
                .text((d) => d.data.descendantCount ?? "");

            // Name Label
            mainGroup.append("text")
                .attr("dy", ".35em")
                .attr("y", 45)
                .style("text-anchor", "middle")
                .text((d) => d.data.name || "Unknown")
                .style("font-size", "12px")
                .style("fill", "#333")
                .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

            // --- Toggle Button (Collapse/Expand) ---
            // Only show if children exist (either in children or _children)
            const toggleButton = nodeEnter.append("g")
                .attr("class", "toggle-btn")
                .attr("transform", "translate(0, 30)") // Position below the main circle
                .style("cursor", "pointer")
                .style("display", (d) => (d.children || d._children) ? "block" : "none")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    if (d.children) {
                        d._children = d.children;
                        d.children = undefined;
                    } else {
                        d.children = d._children || undefined;
                        d._children = undefined;
                    }
                    update(d);
                });

            toggleButton.append("circle")
                .attr("r", 8)
                .style("fill", "white")
                .style("stroke", "steelblue")
                .style("stroke-width", "1px");

            toggleButton.append("text")
                .attr("dy", ".35em")
                .style("text-anchor", "middle")
                .style("font-size", "10px")
                .style("font-weight", "bold")
                .style("fill", "steelblue")
                .text((d) => d._children ? "+" : "-");

            // Transition nodes to their new position
            const nodeUpdate = nodeEnter.merge(node);

            nodeUpdate.transition()
                .duration(200)
                .attr("transform", (d) => `translate(${d.x},${d.y})`);

            // Update Toggle Button State (Text and Visibility)
            nodeUpdate.select(".toggle-btn")
                .style("display", (d) => (d.children || d._children) ? "block" : "none");

            nodeUpdate.select(".toggle-btn text")
                .text((d) => d._children ? "+" : "-");

            nodeUpdate.select("circle.node-circle")
                .style("fill", (d) => d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff");

            // Transition exiting nodes
            const nodeExit = node.exit().transition()
                .duration(200)
                .attr("transform", () => `translate(${source.x},${source.y})`)
                .remove();

            nodeExit.select("circle")
                .attr("r", 1e-6);

            // --- Links ---
            const link = g.selectAll<SVGPathElement, d3.HierarchyPointLink<HierarchyPersonNode>>(".link")
                .data(links, (d) => d.target.data.nodeId);

            const linkEnter = link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", () => {
                    const o = { x: source.x0 || 0, y: source.y0 || 0 };
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return d3.linkVertical()({ source: o, target: o } as any);
                })
                .style("fill", "none")
                .style("stroke", "#ccc")
                .style("stroke-width", "2px");

            const linkUpdate = linkEnter.merge(link);

            linkUpdate.transition()
                .duration(200)
                .attr("d", d3.linkVertical()
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .x((d: any) => d.x)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .y((d: any) => d.y) as any
                );

            link.exit().transition()
                .duration(200)
                .attr("d", () => {
                    const o = { x: source.x || 0, y: source.y || 0 };
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        svg.call(d3.zoom().transform as any, initialTransform);

    }, [data, maxDepth]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9' }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
