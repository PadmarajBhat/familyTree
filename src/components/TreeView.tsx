import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { getPhotoUrl } from '../services/drive';
import type { TreeDocument, PersonNode } from '../logic/types';

interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
    maxDepth?: number | null;
    isExporting?: boolean;
    compact?: boolean;
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

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, maxDepth, isExporting, compact }) => {
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

        console.log('TreeView rendering with data:', {
            rootNodeId: data.rootNodeId,
            nodeCount: Object.keys(data.nodes).length,
            rootNode: data.nodes[data.rootNodeId],
            allNodeIds: Object.keys(data.nodes)
        });

        // If exporting, we don't constrain by container dimensions initially
        const { width, height } = (dimensions.width > 0 && !isExporting) ? dimensions : {
            width: wrapperRef.current.clientWidth || 1000,
            height: wrapperRef.current.clientHeight || 800
        };

        if (width === 0 || height === 0) return;

        // Clear previous runs
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

        if (!isExporting) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            svg.call(zoom as any);
        }

        // --- Build Hierarchy ---
        const buildHierarchy = (nodeId: string, path: Set<string> = new Set()): HierarchyPersonNode | null => {
            if (path.has(nodeId)) {
                return null;
            }
            const newPath = new Set(path).add(nodeId);
            const node = data.nodes[nodeId];
            if (!node) return null;

            const children = node.childrenIds
                .map(childId => buildHierarchy(childId, newPath))
                .filter((n): n is HierarchyPersonNode => n !== null);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const childCount = (node as any).actualChildrenCount ?? children.length;

            return {
                ...node,
                children: children.length > 0 ? children : undefined,
                childrenCount: childCount
            };
        };

        const hierarchyData = buildHierarchy(data.rootNodeId);
        if (!hierarchyData) return;

        const root = d3.hierarchy(hierarchyData) as ExtendedHierarchyNode;
        root.x0 = width / 2;
        root.y0 = 0;

        if (maxDepth) {
            root.descendants().forEach((d) => {
                if (d.depth >= maxDepth) {
                    if (d.children) {
                        d._children = d.children;
                        d.children = undefined;
                    }
                } else if (d._children) {
                    d.children = d._children;
                    d._children = undefined;
                }
            });
        }

        const nodeWidth = compact ? 100 : 160;
        const nodeHeight = compact ? 120 : 200;
        const treeLayout = d3.tree<HierarchyPersonNode>().nodeSize([nodeWidth, nodeHeight]);

        // Safe link generator
        const safeLink = d3.linkVertical()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .x((d: any) => (d.x === undefined || isNaN(d.x)) ? 0 : d.x)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .y((d: any) => (d.y === undefined || isNaN(d.y)) ? 0 : d.y) as any;

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

            nodeEnter.each(function (d) {
                if (d.data.nodeId === 'VIRTUAL_ROOT') return;

                const mainGroup = d3.select(this).append("g")
                    .style("cursor", "pointer")
                    .on("click", (event) => {
                        event.stopPropagation();
                        onNodeClick(d.data.nodeId);
                    });

                const mainNodeId = d.data.nodeId;
                const spouseId = d.data.spouseIds && d.data.spouseIds.length > 0 ? d.data.spouseIds[0] : null;
                const spouseNode = spouseId ? data.nodes[spouseId] : null;

                const defs = d3.select(this).append("defs");
                const circleRadius = compact ? 20 : 30;

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
                        .attr("href", getPhotoUrl(d.data.imageUrl));
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
                        .attr("href", getPhotoUrl(spouseNode.imageUrl));
                }

                if (spouseNode) {
                    // Spouse Circle
                    mainGroup.append("circle")
                        .attr("class", "node-circle-spouse")
                        .attr("cx", compact ? 15 : 20)
                        .attr("r", circleRadius)
                        .style("fill", spouseNode.imageUrl ? `url(#pattern-${spouseNode.nodeId})` : "#fff")
                        .style("stroke", "pink")
                        .style("stroke-width", "3px");

                    // Main Person Circle
                    mainGroup.append("circle")
                        .attr("class", "node-circle-main")
                        .attr("cx", compact ? -15 : -20)
                        .attr("r", circleRadius)
                        .style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                        .style("stroke", "steelblue")
                        .style("stroke-width", "3px");
                } else {
                    // Single Person Rendering
                    mainGroup.append("circle")
                        .attr("class", "node-circle-main")
                        .attr("r", circleRadius)
                        .style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff")
                        .style("stroke", "steelblue")
                        .style("stroke-width", "3px");
                }

                // Children Count Badge
                const hasSpouse = d.data.spouseIds && d.data.spouseIds.length > 0;
                const xOffset = compact ? (hasSpouse ? 30 : 15) : (hasSpouse ? 40 : 20);
                const yOffset = compact ? -15 : -20;

                const badgeGroup = mainGroup.append("g")
                    .attr("class", "badge")
                    .attr("transform", `translate(${xOffset}, ${yOffset})`)
                    .style("display", (d.data.childrenCount || 0) > 0 ? "block" : "none");

                badgeGroup.append("circle")
                    .attr("r", compact ? 8 : 10)
                    .style("fill", "red")
                    .style("stroke", "white");

                badgeGroup.append("text")
                    .attr("dy", ".35em")
                    .style("text-anchor", "middle")
                    .style("fill", "white")
                    .style("font-size", compact ? "8px" : "10px")
                    .style("font-weight", "bold")
                    .text(d.data.childrenCount ?? "");

                // Names
                const nameY = compact ? 30 : 45;
                const spouseNameY = compact ? 42 : 60;
                const nameSize = compact ? "10px" : "12px";
                const spouseNameSize = compact ? "9px" : "11px";

                if (spouseNode) {
                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", nameY)
                        .style("text-anchor", "middle")
                        .text(`${d.data.name || "Unknown"}`)
                        .style("font-size", nameSize)
                        .style("fill", "#333")
                        .style("font-weight", "bold")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", spouseNameY)
                        .style("text-anchor", "middle")
                        .text(`& ${spouseNode.name || "Unknown"}`)
                        .style("font-size", spouseNameSize)
                        .style("fill", "#555")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");
                } else {
                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", nameY)
                        .style("text-anchor", "middle")
                        .text(d.data.name || "Unknown")
                        .style("font-size", nameSize)
                        .style("fill", "#333")
                        .style("font-weight", "bold")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");
                }
            });

            // Toggle Button
            const toggleButton = nodeEnter.append("g")
                .attr("class", "toggle-btn")
                .attr("transform", (d) => {
                    const hasSpouse = d.data.spouseIds && d.data.spouseIds.length > 0;
                    return hasSpouse ? "translate(0, 75)" : "translate(0, 55)";
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

            // Update transitions
            const nodeUpdate = nodeEnter.merge(node);
            nodeUpdate.transition().duration(200)
                .attr("transform", (d) => `translate(${d.x},${d.y})`);

            // Update specific elements
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

            // Links
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

            const linkUpdate = linkEnter.merge(link);
            linkUpdate.transition().duration(200).attr("d", safeLink);

            link.exit().transition().duration(200)
                .attr("d", () => {
                    const o = { x: source.x || 0, y: source.y || 0 };
                    return safeLink({ source: o, target: o });
                })
                .remove();

            // Stash positions
            nodes.forEach((d) => {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        };

        // Initial update
        update(root);

        // Center Tree
        const nodes = root.descendants() as ExtendedHierarchyNode[];
        let minX = Infinity, maxX = -Infinity;
        nodes.forEach((d) => {
            if (d.x !== undefined) {
                minX = Math.min(minX, d.x);
                maxX = Math.max(maxX, d.x);
            }
        });

        // Use treeWidth/scale centering
        const padding = 50;
        const treeWidth = maxX - minX;

        if (isExporting) {
            // ... strict export centering logic ...
            let minY = Infinity, maxY = -Infinity;
            nodes.forEach(d => {
                if (d.y !== undefined) {
                    minY = Math.min(minY, d.y);
                    maxY = Math.max(maxY, d.y);
                }
            });
            const tH = (maxY - minY) + padding * 2;
            const tW = (maxX - minX) + padding * 2;
            svg.attr("width", tW).attr("height", tH);
            g.attr("transform", `translate(${-minX + padding},${-minY + padding})`);
        } else {
            const availableWidth = width - padding * 2;
            const scaleX = availableWidth / (treeWidth || 1);
            const scale = Math.min(Math.max(scaleX, 0.2), 1.2);

            const centerX = (minX + maxX) / 2;
            const translateX = width / 2 - centerX * scale;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            svg.call(zoom.transform as any, d3.zoomIdentity.translate(translateX, 50).scale(scale));
        }

    }, [data, maxDepth, dimensions, isExporting, compact]);

    return (
        <div ref={wrapperRef} style={{
            width: isExporting ? 'auto' : '100%',
            height: isExporting ? 'auto' : '100vh',
            overflow: isExporting ? 'visible' : 'hidden',
            background: '#f9f9f9',
            minHeight: isExporting ? '100px' : undefined // Ensure some height
        }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
