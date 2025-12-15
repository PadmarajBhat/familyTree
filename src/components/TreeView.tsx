import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { getPhotoUrl } from '../services/drive';
import type { TreeDocument, PersonNode } from '../logic/types';
import { ZoomControls } from './ZoomControls';

interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
    maxDepth?: number | null;
    isExporting?: boolean;
    compact?: boolean;
    path?: string[] | null;
    showControls?: boolean;
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

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, maxDepth, isExporting, compact, path, showControls = true }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const { i18n } = useTranslation();
    const currentLang = i18n.language;

    useEffect(() => {
        if (!wrapperRef.current) return;

        let lastWidth = 0;
        let lastHeight = 0;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                // Prevent infinite loops by ignoring small pixel changes or sub-pixel jitter
                if (Math.abs(width - lastWidth) > 5 || Math.abs(height - lastHeight) > 5) {
                    lastWidth = width;
                    lastHeight = height;
                    // Use requestAnimationFrame to debounce slightly
                    requestAnimationFrame(() => {
                        setDimensions({ width, height });
                    });
                }
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

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .filter((event) => {
                // Ignore wheel events (no zoom on scroll)
                if (event.type === 'wheel') return false;
                // Ignore double click (optional, but usually good to keep for standard d3 or disable if unwanted)
                if (event.type === 'dblclick') return false;
                // Allow mousedown/touchstart for panning
                return !event.ctrlKey && !event.button;
            })
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        zoomBehavior.current = zoom;

        if (!isExporting) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            svg.call(zoom as any);
        }

        // --- Build Hierarchy ---
        const buildHierarchy = (nodeId: string, visited: Set<string> = new Set()): HierarchyPersonNode | null => {
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
                .map(childId => buildHierarchy(childId, new Set(visited)))
                .filter((n): n is HierarchyPersonNode => n !== null);

            // Sort children by Age (DOB) if available
            children.sort((a, b) => {
                const dobA = a.dob;
                const dobB = b.dob;
                if (dobA && dobB) {
                    // simple string comparison YYYY-MM-DD works for ISO, but here we have DD-MM-YYYY
                    // parsing needed or just rely on IDs? 
                    // Let's assume input is DD-MM-YYYY
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

        const nodeWidth = compact ? 140 : 160;
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
            const links = treeData.links().filter(l => l.source.data.nodeId !== 'VIRTUAL_ROOT');

            // --- Apply Custom Jump Links (Green Lines) ---
            // Identify path connections that are NOT in 'links'
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
                        // Check if a direct parent-child link exists in D3 tree
                        const isConnected = links.some(l =>
                            (l.source.data.nodeId === uId && l.target.data.nodeId === vId) ||
                            (l.source.data.nodeId === vId && l.target.data.nodeId === uId)
                        );

                        if (!isConnected) {
                            // This is a jump connection (e.g. cross-tree, or spouse, or linked node)
                            // User wants a Green Line
                            // Anchor adjustment: Spouses?
                            // Simple center-to-center or bottom-to-top
                            // We'll use bottom of source to top of target if vertically aligned, or just center?
                            // Let's use standard tree link anchors (bottom source, top target) if Y increases
                            // Else just direct curve.
                            jumpLinks.push({
                                source: { x: u.x, y: u.y },
                                target: { x: v.x, y: v.y }
                            });
                        }
                    }
                }
            }


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
                    const mainName = (currentLang && d.data.nameTranslations?.[currentLang]) || d.data.name || "Unknown";
                    const spouseName = (currentLang && spouseNode.nameTranslations?.[currentLang]) || spouseNode.name || "Unknown";

                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", nameY)
                        .style("text-anchor", "middle")
                        .text(mainName)
                        .style("font-size", nameSize)
                        .style("fill", "#333")
                        .style("font-weight", "bold")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");

                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", spouseNameY)
                        .style("text-anchor", "middle")
                        .text(`& ${spouseName}`)
                        .style("font-size", spouseNameSize)
                        .style("fill", "#555")
                        .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff");
                } else {
                    const mainName = (currentLang && d.data.nameTranslations?.[currentLang]) || d.data.name || "Unknown";
                    mainGroup.append("text")
                        .attr("dy", ".35em")
                        .attr("y", nameY)
                        .style("text-anchor", "middle")
                        .text(mainName)
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

            // Links (Standard Tree)
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

            // --- Custom Jump Links (Green) ---
            const jumpLink = g.selectAll<SVGPathElement, typeof jumpLinks[0]>(".jump-link")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .data(jumpLinks, (d: any) => `${d.source.x}-${d.source.y}-${d.target.x}-${d.target.y}`);

            const jumpLinkEnter = jumpLink.enter().insert("path", "g")
                .attr("class", "jump-link")
                .attr("d", (d) => {
                    // Initial position logic can be refined for animation
                    // For now, just draw
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
                    // Use curveBundle or just standard link
                    // Since they might be horizontal siblings, linkHorizontal might be better?
                    // Or linkVertical if they are stacked.
                    // The safeLink is Vertical.
                    // Let's use a generic curve.
                    // Simple quadratic bezier for "Jump"
                    // Curve down deeply to differentiate from hierarchy links? 
                    // Or curve based on distance?
                    // const dx = d.target.x - d.source.x;
                    // const dy = d.target.y - d.source.y;

                    return `M${d.source.x},${d.source.y} Q${(d.source.x + d.target.x) / 2},${d.target.y + 100} ${d.target.x},${d.target.y}`;
                });

            jumpLink.exit().remove();


            // Stash positions
            nodes.forEach((d) => {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        };

        // Initial update
        update(root);

        // Center Tree Function
        const centerTree = () => {
            const nodes = root.descendants() as ExtendedHierarchyNode[];
            let minX = Infinity, maxX = -Infinity;
            nodes.forEach((d) => {
                if (d.x !== undefined) {
                    minX = Math.min(minX, d.x);
                    maxX = Math.max(maxX, d.x);
                }
            });

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
                // Initial scale
                const scale = Math.min(Math.max(scaleX, 0.2), 1.2);

                const centerX = (minX + maxX) / 2;
                const translateX = width / 2 - centerX * scale;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                svg.transition().duration(750)
                    .call(zoom.transform as any, d3.zoomIdentity.translate(translateX, 50).scale(scale));
            }
        };

        // Initial centering
        centerTree();

    }, [data, maxDepth, dimensions, isExporting, compact, currentLang]);

    const handleZoomIn = () => {
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 1.2);
        }
    };

    const handleZoomOut = () => {
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 0.8);
        }
    };

    const handleReset = () => {
        // To properly reset, we need to re-invoke the centering logic.
        // Since centerTree is inside useEffect, we can't call it directly easily without refactoring.
        // However, we can simply re-compute the "Best fit" transform here or trigger a re-render/effect.
        // Better: refactor calculating the best fit into a helper, OR just reset to Identity which is "0,0 scale 1".
        // BUT user asked for "Root node at top center".

        // Let's recalculate simply here or force update. 
        // Actually, d3.tree layout is deterministic. If we know the root coordinates, we can center it.
        // But the tree layout `x` depends on the data.
        // Simplest way: Triggering the same logic as the initial load.
        // We can just define the calculation here again or use a ref to the function.

        // Re-implementing a simple "Center Top" for now:
        if (svgRef.current && zoomBehavior.current && wrapperRef.current) {
            const width = wrapperRef.current.clientWidth;
            // We want root at x=width/2, y=50. 
            // IMPORTANT: The ROOT node usually has x=0 relative to the group if the layout centers it, 
            // but `d3.tree` usually places root at (0,0) or centers children.
            // In our code: `root.x0 = width / 2;` was just initial. The tree layout assigns x/y.
            // The tree layout usually centers the root's *children*.

            // A quick fix to "reset" is often just identity, but user specifically asked "Root node at top center".
            // We can achieve this by translation.

            // For now, let's reset to Identity translated to center width.
            const t = d3.zoomIdentity.translate(width / 2, 50).scale(1);
            d3.select(svgRef.current).transition().duration(750).call(zoomBehavior.current.transform, t);
        }
    };


    return (
        <div ref={wrapperRef} style={{
            width: isExporting ? 'auto' : '100%',
            height: isExporting ? 'auto' : '100%',
            overflow: isExporting ? 'visible' : 'hidden',
            background: '#f9f9f9',
            minHeight: isExporting ? '100px' : undefined, // Ensure some height
            position: 'relative'
        }}>
            <svg ref={svgRef}></svg>
            {!isExporting && showControls && (
                <ZoomControls
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onReset={handleReset}
                />
            )}
        </div>
    );
};
