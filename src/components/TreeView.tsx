import { useEffect, useRef, useState } from 'react';
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
    childrenCount?: number;
}

interface ExtendedHierarchyNode extends d3.HierarchyNode<HierarchyPersonNode> {
    _children?: ExtendedHierarchyNode[] | null | undefined;
    x0?: number;
    y0?: number;
}

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, maxDepth }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!wrapperRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        resizeObserver.observe(wrapperRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!data || !svgRef.current || !wrapperRef.current) return;

        const { width, height } = dimensions.width > 0 ? dimensions : {
            width: wrapperRef.current.clientWidth,
            height: wrapperRef.current.clientHeight
        };

        if (width === 0 || height === 0) return;

        // Clear previous
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        svg.call(zoom as any);

        // --- Build Hierarchy with Direct Children Count ---
        const buildHierarchy = (nodeId: string, path: Set<string> = new Set()): HierarchyPersonNode | null => {
            // Cycle detection
            if (path.has(nodeId)) return null;
            const newPath = new Set(path).add(nodeId);

            const node = data.nodes[nodeId];
            if (!node) return null;

            const children = node.childrenIds
                .map(childId => buildHierarchy(childId, newPath))
                .filter((n): n is HierarchyPersonNode => n !== null);

            return {
                ...node,
                children: children.length > 0 ? children : undefined,
                childrenCount: children.length
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

        const treeLayout = d3.tree<HierarchyPersonNode>().nodeSize([160, 200]); // Increased spacing

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

            // --- Profile Pictures & Patterns ---
            mainGroup.each(function (d) {
                const mainNodeId = d.data.nodeId;
                const spouseId = d.data.spouseIds && d.data.spouseIds.length > 0 ? d.data.spouseIds[0] : null;
                const spouseNode = spouseId ? data.nodes[spouseId] : null;

                const defs = d3.select(this).append("defs");

                // 1. Main Person Pattern
                if (d.data.imageUrl) {
                    defs.append("pattern")
                        .attr("id", `pattern-${mainNodeId}`)
                        .attr("height", "100%")
                        .attr("width", "100%")
                        .attr("patternContentUnits", "objectBoundingBox")
                        .append("image")
                        .attr("height", 1)
                        .attr("width", 1)
                        .attr("preserveAspectRatio", "none")
                        .attr("href", d.data.imageUrl);
                }

                // 2. Spouse Pattern
                if (spouseNode && spouseNode.imageUrl) {
                    defs.append("pattern")
                        .attr("id", `pattern-${spouseNode.nodeId}`)
                        .attr("height", "100%")
                        .attr("width", "100%")
                        .attr("patternContentUnits", "objectBoundingBox")
                        .append("image")
                        .attr("height", 1)
                        .attr("width", 1)
                        .attr("preserveAspectRatio", "none")
                        .attr("href", spouseNode.imageUrl);
                }
            });

            // --- Render Circles ---
            mainGroup.each(function (d) {
                const group = d3.select(this);
                const spouseId = d.data.spouseIds && d.data.spouseIds.length > 0 ? d.data.spouseIds[0] : null;
                const spouseNode = spouseId ? data.nodes[spouseId] : null;

                if (spouseNode) {
                    // --- Couple Rendering ---

                    // Spouse Circle
                    group.append("circle")
                        .attr("class", "node-circle-spouse")
                        .attr("cx", 20)
                        .attr("r", 30)
                        .style("fill", spouseNode.imageUrl ? `url(#pattern-${spouseNode.nodeId})` : "#fff")
                        .style("stroke", "pink")
                        .style("stroke-width", "3px");

                    // Main Person Circle
                    group.append("circle")
                        .attr("class", "node-circle-main")
                        .attr("cx", -20)
                        .attr("r", 30)
                        .style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                        .style("stroke", "steelblue")
                        .style("stroke-width", "3px");

                } else {
                    // --- Single Person Rendering ---
                    group.append("circle")
                        .attr("class", "node-circle-main")
                        .attr("r", 30)
                        .style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                        .style("stroke", "steelblue")
                        .style("stroke-width", "3px");
                }
            });

            // Children Count Badge
            const badgeGroup = mainGroup.append("g")
                .attr("class", "badge")
                .attr("transform", (d) => {
                    const hasSpouse = d.data.spouseIds && d.data.spouseIds.length > 0;
                    return hasSpouse ? "translate(40, -20)" : "translate(20, -20)";
                })
                .style("display", (d) => (d.data.childrenCount || 0) > 0 ? "block" : "none");

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
                .text((d) => d.data.childrenCount ?? "");

            // --- Names ---
            mainGroup.each(function (d) {
                const group = d3.select(this);
                const spouseId = d.data.spouseIds && d.data.spouseIds.length > 0 ? d.data.spouseIds[0] : null;
                const spouseNode = spouseId ? data.nodes[spouseId] : null;

                if (spouseNode) {
                    // Main Name
                    group.append("text")
                        .attr("dy", ".35em")
                        .attr("y", 45)
                        .style("text-anchor", "middle")
                        .text(`${d.data.name || "Unknown"}`)
                        .style("font-size", "12px")
                        .style("fill", "#333")
                        .style("font-weight", "bold")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

                    // Spouse Name
                    group.append("text")
                        .attr("dy", ".35em")
                        .attr("y", 60) // Below main name
                        .style("text-anchor", "middle")
                        .text(`& ${spouseNode.name || "Unknown"}`)
                        .style("font-size", "11px")
                        .style("fill", "#555")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

                } else {
                    group.append("text")
                        .attr("dy", ".35em")
                        .attr("y", 45)
                        .style("text-anchor", "middle")
                        .text(d.data.name || "Unknown")
                        .style("font-size", "12px")
                        .style("fill", "#333")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");
                }
            });

            // --- Toggle Button (Collapse/Expand) ---
            // Only show if children exist (either in children or _children)
            const toggleButton = nodeEnter.append("g")
                .attr("class", "toggle-btn")
                .attr("transform", (d) => {
                    const hasSpouse = d.data.spouseIds && d.data.spouseIds.length > 0;
                    return hasSpouse ? "translate(0, 75)" : "translate(0, 55)"; // Adjust based on names height
                })
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

            // Update circles fills in case images loaded or changed
            nodeUpdate.select(".node-circle-main")
                .style("fill", (d) => d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff");

            nodeUpdate.each(function (d) {
                const spouseId = d.data.spouseIds && d.data.spouseIds.length > 0 ? d.data.spouseIds[0] : null;
                if (spouseId) {
                    d3.select(this).select(".node-circle-spouse")
                        .style("fill", data.nodes[spouseId]?.imageUrl ? `url(#pattern-${spouseId})` : "#fff");
                }
            });

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

        // Calculate bounds to fit screen
        const nodes = root.descendants() as ExtendedHierarchyNode[];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        nodes.forEach((d) => {
            if (d.x !== undefined) {
                minX = Math.min(minX, d.x);
                maxX = Math.max(maxX, d.x);
            }
            if (d.y !== undefined) {
                minY = Math.min(minY, d.y);
                maxY = Math.max(maxY, d.y);
            }
        });

        const padding = 50;
        const treeWidth = maxX - minX;
        // const treeHeight = maxY - minY; // Not strictly needed for vertical if we just want to fit width or scale reasonably

        // Calculate scale to fit width (with some limits)
        const availableWidth = width - padding * 2;
        const scaleX = availableWidth / (treeWidth || 1);

        // Limit scale to be reasonable (e.g., not too zoomed in, not too zoomed out)
        const scale = Math.min(Math.max(scaleX, 0.2), 1.2);

        // Center horizontally based on the tree's center
        const centerX = (minX + maxX) / 2;
        const translateX = width / 2 - centerX * scale;
        const translateY = 50; // Fixed top padding

        const initialTransform = d3.zoomIdentity
            .translate(translateX, translateY)
            .scale(scale);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        svg.call(zoom.transform as any, initialTransform);

    }, [data, maxDepth, dimensions]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9' }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
