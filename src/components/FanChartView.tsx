import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TreeDocument, PersonNode } from '../logic/types';

interface FanChartViewProps {
    data: TreeDocument;
    rootNodeId: string;
    onNodeClick: (nodeId: string) => void;
    initialMode?: 'ancestor' | 'descendant' | 'hourglass';
}

interface AncestorNode extends PersonNode {
    children?: AncestorNode[];
    generation: number;
    _children?: AncestorNode[];
    spouseName?: string | null;
    spouseImageUrl?: string | null;
}

export const FanChartView: React.FC<FanChartViewProps> = ({ data, rootNodeId, onNodeClick, initialMode = 'descendant' }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [mode, setMode] = useState<'ancestor' | 'descendant' | 'hourglass'>(initialMode);
    const [rotation, setRotation] = useState(0);

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
            .attr("transform", `translate(${width / 2},${height / 2}) rotate(${rotation})`);

        // Gesture rotation + zoom
        let startAngle = 0;
        let currentRotation = rotation;
        let currentScale = 1;
        let currentTranslate = { x: 0, y: 0 };

        const dragRotate = d3.drag<SVGSVGElement, unknown>()
            .on("start", function (event) {
                const [x, y] = d3.pointer(event, svgRef.current);
                const cx = width / 2;
                const cy = height / 2;
                startAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI - currentRotation;
            })
            .on("drag", function (event) {
                const [x, y] = d3.pointer(event, svgRef.current);
                const cx = width / 2;
                const cy = height / 2;
                const angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
                currentRotation = angle - startAngle;
                setRotation(currentRotation);
                mainGroup.attr("transform",
                    `translate(${cx + currentTranslate.x},${cy + currentTranslate.y}) rotate(${currentRotation}) scale(${currentScale})`);
            });

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (event) => {
                currentScale = event.transform.k;
                currentTranslate = { x: event.transform.x, y: event.transform.y };
                const cx = width / 2;
                const cy = height / 2;
                mainGroup.attr("transform",
                    `translate(${cx + currentTranslate.x},${cy + currentTranslate.y}) rotate(${currentRotation}) scale(${currentScale})`);
            });

        d3.select(svgRef.current)
            .call(zoom as any)
            .on("mousedown.drag", null)
            .call(dragRotate as any);

        // Two-finger touch rotation support
        let lastTouchAngle = 0;

        const handleTouchMove = (event: TouchEvent) => {
            if (event.touches.length === 2) {
                event.preventDefault();
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];

                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                const touchAngle = Math.atan2(dy, dx) * 180 / Math.PI;

                if (lastTouchAngle !== 0) {
                    const deltaAngle = touchAngle - lastTouchAngle;
                    currentRotation += deltaAngle;
                    setRotation(currentRotation);
                    const cx = width / 2;
                    const cy = height / 2;
                    mainGroup.attr("transform",
                        `translate(${cx + currentTranslate.x},${cy + currentTranslate.y}) rotate(${currentRotation}) scale(${currentScale})`);
                }
                lastTouchAngle = touchAngle;
            } else {
                lastTouchAngle = 0;
            }
        };

        const handleTouchEnd = () => {
            lastTouchAngle = 0;
        };

        const svgElement = svgRef.current;
        svgElement.addEventListener('touchmove', handleTouchMove, { passive: false });
        svgElement.addEventListener('touchend', handleTouchEnd);

        const renderTree = (rootData: AncestorNode, partitionSize: number, rotationOffset: number, skipCenterText: boolean = false) => {
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

            paths.each(function (d) {
                if (d.depth === 0) return;
                const centroid = arc.centroid(d as any);
                const group = d3.select(this);

                if (d.data.imageUrl) {
                    group.append("clipPath")
                        .attr("id", `clip-${d.data.nodeId}-${Math.random().toString(36).substr(2, 9)}`)
                        .append("circle")
                        .attr("cx", centroid[0])
                        .attr("cy", centroid[1] - 15)
                        .attr("r", 12);

                    const clipId = group.select("clipPath").attr("id");

                    group.append("image")
                        .attr("xlink:href", d.data.imageUrl)
                        .attr("x", centroid[0] - 12)
                        .attr("y", centroid[1] - 27)
                        .attr("width", 24)
                        .attr("height", 24)
                        .attr("preserveAspectRatio", "xMidYMid slice")
                        .attr("clip-path", `url(#${clipId})`)
                        .style("pointer-events", "none");
                }
            });

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

                const totalRotation = rotation + rotationOffset;
                const normalizedRotation = ((totalRotation % 360) + 360) % 360;
                const rotationRad = normalizedRotation * Math.PI / 180;
                const visualMidAngle = (midAngle + rotationRad) % (2 * Math.PI);

                const needsFlip = visualMidAngle > Math.PI / 2 && visualMidAngle < 3 * Math.PI / 2;

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

        if (mode === 'hourglass') {
            const ancestorData = buildAncestorTree(rootNodeId);
            const descendantData = buildDescendantTree(rootNodeId);

            if (ancestorData) {
                renderTree(ancestorData, Math.PI, -90, true);
            }
            if (descendantData) {
                renderTree(descendantData, Math.PI, 90, true);
            }

            // Manually render center text for Hourglass (only once)
            if (ancestorData || descendantData) {
                const rootName = (ancestorData || descendantData)?.name || "Unknown";
                mainGroup.append("text")
                    .attr("text-anchor", "middle")
                    .attr("dy", "0.35em")
                    .style("pointer-events", "none")
                    .style("font-size", "12px")
                    .style("font-weight", "bold")
                    .style("fill", "#333")
                    .text(rootName);
            }
        } else {
            const rootData = mode === 'ancestor' ? buildAncestorTree(rootNodeId) : buildDescendantTree(rootNodeId);
            if (rootData) {
                renderTree(rootData, 2 * Math.PI, 0, false);
            }
        }

        // Cleanup
        return () => {
            svgElement.removeEventListener('touchmove', handleTouchMove);
            svgElement.removeEventListener('touchend', handleTouchEnd);
        };

    }, [data, rootNodeId, dimensions, mode, rotation]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                <div>
                    <strong>Mode</strong><br />
                    <label style={{ marginRight: '10px' }}>
                        <input
                            type="radio"
                            name="chartMode"
                            value="descendant"
                            checked={mode === 'descendant'}
                            onChange={() => setMode('descendant')}
                        /> Descendants
                    </label>
                    <label style={{ marginRight: '10px' }}>
                        <input
                            type="radio"
                            name="chartMode"
                            value="ancestor"
                            checked={mode === 'ancestor'}
                            onChange={() => setMode('ancestor')}
                        /> Ancestors
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="chartMode"
                            value="hourglass"
                            checked={mode === 'hourglass'}
                            onChange={() => setMode('hourglass')}
                        /> Hourglass
                    </label>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                        💡 Drag to rotate • Scroll/Pinch to zoom
                    </div>
                </div>
            </div>
            <svg ref={svgRef}></svg>
        </div>
    );
};
