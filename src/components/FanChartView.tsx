
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TreeDocument, PersonNode } from '../logic/types';
import { getPhotoUrl } from '../services/drive';

interface FanChartViewProps {
    data: TreeDocument;
    rootNodeId: string;
    onNodeClick: (nodeId: string) => void;
    initialMode?: 'ancestor' | 'descendant' | 'hourglass';
    onResetRoot?: () => void;
}

interface AncestorNode extends PersonNode {
    children?: AncestorNode[];
    generation: number;
    _children?: AncestorNode[];
    spouseName?: string | null;
    spouseImageUrl?: string | null;
}

export const FanChartView: React.FC<FanChartViewProps> = ({ data, rootNodeId, onNodeClick, onResetRoot }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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
        return () => resizeObserver.disconnect();
    }, []);

    const handleReset = () => {
        if (onResetRoot) {
            onResetRoot();
        }
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current)
                .transition()
                .duration(750)
                .call(zoomBehavior.current.transform, d3.zoomIdentity);
        }
    };

    useEffect(() => {
        if (!data || !svgRef.current || !wrapperRef.current || !rootNodeId) return;

        const { width, height } = dimensions.width > 0 ? dimensions : {
            width: wrapperRef.current.clientWidth,
            height: wrapperRef.current.clientHeight
        };

        if (width === 0 || height === 0) return;

        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`);

        const radius = Math.min(width, height) / 2 - 20;

        const buildAncestorTree = (nodeId: string, generation: number = 0): AncestorNode | null => {
            const node = data.nodes[nodeId];
            if (!node) return null;
            if (generation > 6) return { ...node, generation, children: undefined };

            const parents: AncestorNode[] = [];
            let spouseName = null;
            let spouseImageUrl = null;

            if (node.parentId) {
                const parent1 = buildAncestorTree(node.parentId, generation + 1);
                if (parent1) parents.push(parent1);

                const parentNode = data.nodes[node.parentId];
                if (parentNode && parentNode.spouseIds && parentNode.spouseIds.length > 0) {
                    const spouseId = parentNode.spouseIds[0];
                    const parent2 = buildAncestorTree(spouseId, generation + 1);
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

        const buildDescendantTree = (nodeId: string, generation: number = 0): AncestorNode | null => {
            const node = data.nodes[nodeId];
            if (!node) return null;
            if (generation > 6) return { ...node, generation, children: undefined };

            const children: AncestorNode[] = [];
            let spouseName = null;
            let spouseImageUrl = null;

            if (node.childrenIds) {
                node.childrenIds.forEach(childId => {
                    const child = buildDescendantTree(childId, generation + 1);
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

        const mainGroup = svg.append("g")
            .attr("class", "main-group")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        // Zoom only (no rotation)
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 3])
            .on("zoom", (event) => {
                mainGroup.attr("transform",
                    `translate(${width / 2 + event.transform.x},${height / 2 + event.transform.y}) scale(${event.transform.k})`);
            });

        zoomBehavior.current = zoom;

        d3.select(svgRef.current)
            .call(zoom as any);

        const renderTree = (rootData: AncestorNode, partitionSize: number, rotationOffset: number, skipCenterText: boolean = false, isDescendants: boolean = false) => {
            const hierarchy = d3.hierarchy(rootData)
                .sum(() => 1)
                .sort((a, b) => (b.value || 0) - (a.value || 0));

            const partition = d3.partition<AncestorNode>()
                .size([partitionSize, radius]);

            const root = partition(hierarchy);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const arc = d3.arc<d3.HierarchyRectangularNode<AncestorNode>>()
                .startAngle(d => d.x0)
                .endAngle(d => d.x1)
                .innerRadius(d => d.y0)
                .outerRadius(d => d.y1);

            const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, root.children ? root.children.length + 1 : 1));

            const group = mainGroup.append("g")
                .attr("transform", `rotate(${rotationOffset})`);

            const paths = group.selectAll("g")
                .data(root.descendants().filter(d => d.depth < 6))
                .join("g");

            paths.append("path")
                .attr("fill", d => {
                    let current = d;
                    while (current.depth > 1 && current.parent) current = current.parent;
                    return color(current.data.name || "Unknown");
                })
                .attr("fill-opacity", d => d.depth === 0 ? 0.8 : 0.6)
                .attr("d", arc)
                .style("cursor", "pointer")
                .style("stroke", "white")
                .style("stroke-width", "1px")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    onNodeClick(d.data.nodeId);
                })
                .append("title")
                .text(d => `${d.data.name}\n${d.data.dob ? d.data.dob.split('-')[0] : ''} - ${d.data.dod ? d.data.dod.split('-')[0] : ''}`);



            // Curved text
            paths.each(function (d) {
                if (d.depth === 0) {
                    if (skipCenterText) return;
                    d3.select(this).append("text")
                        .attr("text-anchor", "middle")
                        .attr("dy", "0.35em")
                        .style("pointer-events", "none")
                        .style("font-size", "12px")
                        .style("font-weight", "bold")
                        .style("fill", "#333")
                        .text(d.data.name || "Unknown");
                    return;
                }

                const group = d3.select(this);
                const startAngle = d.x0;
                const endAngle = d.x1;
                const midAngle = (startAngle + endAngle) / 2;

                // Text orientation logic:
                // For ancestors (top half, rotated -90): flip text when it would be upside down
                // For descendants (bottom half, rotated 90): flip text to orient upward
                const needsFlip = isDescendants
                    ? midAngle < Math.PI  // Descendants: flip text in first half to orient upward
                    : midAngle > Math.PI; // Ancestors: flip text in second half

                const r = needsFlip
                    ? d.y0 + (d.y1 - d.y0) * 0.8
                    : d.y0 + (d.y1 - d.y0) * 0.2;

                const arcAngle = endAngle - startAngle;
                const arcLength = r * arcAngle;

                let displayText = d.data.spouseName
                    ? `${d.data.name} & ${d.data.spouseName}`
                    : d.data.name || "Unknown";

                const estimatedTextWidth = displayText.length * 5.5;

                if (arcLength < 20) return;

                if (estimatedTextWidth > arcLength * 0.9) {
                    const maxChars = Math.floor((arcLength * 0.9) / 5.5);
                    if (maxChars < 3) return;
                    displayText = displayText.substring(0, maxChars - 1) + "…";
                }

                const x0 = r * Math.sin(startAngle);
                const y0 = -r * Math.cos(startAngle);
                const x1 = r * Math.sin(endAngle);
                const y1 = -r * Math.cos(endAngle);

                const pathData = needsFlip
                    ? `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x0} ${y0}`
                    : `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;

                // Add images
                const imageSize = Math.min(arcLength, (d.y1 - d.y0)) * 0.7;
                if (imageSize > 10) {
                    const clipId = `clip-${d.data.nodeId}-${Math.random().toString(36).substr(2, 9)}`;

                    group.append("clipPath")
                        .attr("id", clipId)
                        .append("circle")
                        .attr("r", imageSize / 2)
                        .attr("cx", 0)
                        .attr("cy", 0);

                    const centroid = arc.centroid(d as any);

                    if (d.data.imageUrl) {
                        const imageUrl = getPhotoUrl(d.data.imageUrl);
                        if (imageUrl) {
                            group.append("image")
                                .attr("xlink:href", imageUrl)
                                .attr("width", imageSize)
                                .attr("height", imageSize)
                                .attr("x", centroid[0] - imageSize / 2)
                                .attr("y", centroid[1] - imageSize / 2)
                                .attr("clip-path", `url(#${clipId})`)
                                .style("pointer-events", "none");
                        }
                    }
                }

                const pathId = `textPath-${d.data.nodeId}-${Math.random().toString(36).substr(2, 9)}`;
                group.append("path")
                    .attr("id", pathId)
                    .attr("d", pathData)
                    .style("fill", "none")
                    .style("stroke", "none");

                const text = group.append("text")
                    .style("pointer-events", "none")
                    .style("font-size", "9px")
                    .style("font-weight", "bold")
                    .style("fill", "#333");

                text.append("textPath")
                    .attr("xlink:href", `#${pathId}`)
                    .attr("startOffset", "50%")
                    .attr("text-anchor", "middle")
                    .attr("dy", "0.35em")
                    .text(displayText);
            });
        };

        // Always render in hourglass mode
        const ancestorData = buildAncestorTree(rootNodeId);
        const descendantData = buildDescendantTree(rootNodeId);

        if (ancestorData) {
            renderTree(ancestorData, Math.PI, -90, true, false);
        }
        if (descendantData) {
            renderTree(descendantData, Math.PI, 90, true, true);
        }

        // Manually render center text for Hourglass (only once, horizontally)
        // Add background to make it readable over the dividing line
        if (ancestorData || descendantData) {
            const rootNode = ancestorData || descendantData;
            if (!rootNode) return;

            const rootName = rootNode.name || "Unknown";
            const spouseName = rootNode.spouseName;

            const displayText = spouseName ? `${rootName} & ${spouseName}` : rootName;

            // Add white background rectangle
            const textWidth = displayText.length * 8; // Approximate width
            const rectHeight = 50; // Increased height for images

            mainGroup.append("rect")
                .attr("x", -textWidth / 2 - 20)
                .attr("y", -rectHeight / 2)
                .attr("width", textWidth + 40)
                .attr("height", rectHeight)
                .attr("fill", "white")
                .attr("rx", 10)
                .style("opacity", 0.95)
                .style("stroke", "#ccc")
                .style("stroke-width", "1px");

            // Images for center node
            const centerImageSize = 30;

            if (rootNode.imageUrl) {
                const rootImageUrl = getPhotoUrl(rootNode.imageUrl);
                if (rootImageUrl) {
                    mainGroup.append("clipPath")
                        .attr("id", "center-clip-root")
                        .append("circle")
                        .attr("r", centerImageSize / 2)
                        .attr("cx", spouseName ? -20 : 0)
                        .attr("cy", -15);

                    mainGroup.append("image")
                        .attr("xlink:href", rootImageUrl)
                        .attr("width", centerImageSize)
                        .attr("height", centerImageSize)
                        .attr("x", (spouseName ? -20 : 0) - centerImageSize / 2)
                        .attr("y", -15 - centerImageSize / 2)
                        .attr("clip-path", "url(#center-clip-root)");
                }
            }

            if (spouseName && rootNode.spouseImageUrl) {
                const spouseImageUrl = getPhotoUrl(rootNode.spouseImageUrl);
                if (spouseImageUrl) {
                    mainGroup.append("clipPath")
                        .attr("id", "center-clip-spouse")
                        .append("circle")
                        .attr("r", centerImageSize / 2)
                        .attr("cx", 20)
                        .attr("cy", -15);

                    mainGroup.append("image")
                        .attr("xlink:href", spouseImageUrl)
                        .attr("width", centerImageSize)
                        .attr("height", centerImageSize)
                        .attr("x", 20 - centerImageSize / 2)
                        .attr("y", -15 - centerImageSize / 2)
                        .attr("clip-path", "url(#center-clip-spouse)");
                }
            }

            // Add text on top of background
            mainGroup.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "1.2em") // Moved down to make room for images
                .attr("transform", "rotate(0)") // Ensure horizontal text
                .style("pointer-events", "none")
                .style("font-size", "14px")
                .style("font-weight", "bold")
                .style("fill", "#333")
                .text(displayText);
        }

    }, [data, rootNodeId, dimensions]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>💡 Click nodes to view details • Scroll/Pinch to zoom</span>
                <button onClick={handleReset} style={{ border: '1px solid #ccc', background: '#fff', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>
                    Reset View
                </button>
            </div>
            <svg ref={svgRef}></svg>
        </div>
    );
};
