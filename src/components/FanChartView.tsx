import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TreeDocument, PersonNode } from '../logic/types';

interface FanChartViewProps {
    data: TreeDocument;
    rootNodeId: string;
    onNodeClick: (nodeId: string) => void;
}

interface AncestorNode extends PersonNode {
    children?: AncestorNode[];
    generation: number;
    // For descendants
    _children?: AncestorNode[];
    spouseName?: string | null;
    spouseImageUrl?: string | null;
}

export const FanChartView: React.FC<FanChartViewProps> = ({ data, rootNodeId, onNodeClick }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [mode, setMode] = useState<'ancestor' | 'descendant'>('descendant');
    const [rotation, setRotation] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);

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

        // Clear previous
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-width / 2, -height / 2, width, height]);

        const radius = Math.min(width, height) / 2 - 20; // Margin

        // --- Build Hierarchy ---
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

            // Find spouse info for current node
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

            // Find spouse info for current node
            if (node.spouseIds && node.spouseIds.length > 0) {
                const spouse = data.nodes[node.spouseIds[0]];
                if (spouse) {
                    spouseName = spouse.name;
                    spouseImageUrl = spouse.imageUrl;
                }
            }

            return { ...node, generation, spouseName, spouseImageUrl, children: children.length > 0 ? children : undefined };
        };

        const rootData = mode === 'ancestor' ? buildAncestorTree(rootNodeId) : buildDescendantTree(rootNodeId);

        if (!rootData) return;

        const hierarchy = d3.hierarchy(rootData)
            .sum(() => 1)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        // Partition layout
        const partition = d3.partition<AncestorNode>()
            .size([2 * Math.PI, radius]);

        const root = partition(hierarchy);

        // Arc generator
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arc = d3.arc<d3.HierarchyRectangularNode<AncestorNode>>()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1);

        // Color scale
        const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, root.children ? root.children.length + 1 : 1));

        const mainGroup = svg.append("g")
            .attr("transform", `rotate(${rotation}) scale(${zoomLevel})`);

        // Draw arcs
        const paths = mainGroup.selectAll("path")
            .data(root.descendants().filter(d => d.depth < 6))
            .join("g"); // Use group for path + image + text

        // 1. Arc Path (Background)
        paths.append("path")
            .attr("id", d => `arc-${d.data.nodeId}`) // ID for text path if needed
            .attr("fill", d => {
                while (d.depth > 1 && d.parent) d = d.parent;
                return color(d.data.name || "Unknown");
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

        // 2. Images (Clipped to Arc or Circle in Arc)
        // Placing a circle image in the center of the arc is easier and looks good
        paths.each(function (d) {
            if (d.depth === 0) return; // Skip center for now, or handle differently
            // Calculate center of arc
            const centroid = arc.centroid(d as any);
            const group = d3.select(this);

            // Check space available
            // const angle = d.x1 - d.x0;
            // const r = (d.y1 - d.y0) / 2;

            if (d.data.imageUrl) {
                group.append("clipPath")
                    .attr("id", `clip-${d.data.nodeId}`)
                    .append("circle")
                    .attr("cx", centroid[0])
                    .attr("cy", centroid[1] - 15) // Move up slightly
                    .attr("r", 12);

                group.append("image")
                    .attr("xlink:href", d.data.imageUrl)
                    .attr("x", centroid[0] - 12)
                    .attr("y", centroid[1] - 27)
                    .attr("width", 24)
                    .attr("height", 24)
                    .attr("preserveAspectRatio", "xMidYMid slice")
                    .attr("clip-path", `url(#clip-${d.data.nodeId})`)
                    .style("pointer-events", "none");
            }
        });

        // 3. Text Labels
        paths.append("text")
            .attr("pointer-events", "none")
            .attr("text-anchor", "middle")
            .style("user-select", "none")
            .attr("transform", function (d) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                // Radial rotation:
                // Text should be perpendicular to the radius line?
                // Or aligned with the radius line?
                // "Radially" usually means reading from center outwards or inwards.
                // Let's align with the radius.
                const rotation = x - 90;

                // Flip text on left side for readability
                const rotateText = (x > 180) ? rotation + 180 : rotation;

                return `rotate(${rotateText}) translate(${d.depth === 0 ? 0 : y},0)`;
            })
            .attr("dy", "0.35em")
            .style("font-size", d => Math.min(10, (d.x1 - d.x0) * 100) + "px")
            .style("fill", "#333")
            .style("font-weight", "bold")
            .each(function (d) {
                const el = d3.select(this);
                // Name
                el.append("tspan")
                    .attr("x", 0)
                    .attr("dy", d.data.imageUrl ? "5px" : "0") // Adjust if image exists
                    .text(d.data.name || "Unknown");

                // Spouse
                if (d.data.spouseName) {
                    el.append("tspan")
                        .attr("x", 0)
                        .attr("dy", "1.1em")
                        .style("font-size", "0.8em")
                        .style("font-weight", "normal")
                        .text(`& ${d.data.spouseName}`);
                }
            });

    }, [data, rootNodeId, dimensions, mode, rotation, zoomLevel]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                <div style={{ marginBottom: '10px' }}>
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
                    <label>
                        <input
                            type="radio"
                            name="chartMode"
                            value="ancestor"
                            checked={mode === 'ancestor'}
                            onChange={() => setMode('ancestor')}
                        /> Ancestors
                    </label>
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <strong>Rotation</strong><br />
                    <input
                        type="range"
                        min="0"
                        max="360"
                        value={rotation}
                        onChange={(e) => setRotation(Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
                <div>
                    <strong>Zoom</strong><br />
                    <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={zoomLevel}
                        onChange={(e) => setZoomLevel(Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
            </div>
            <svg ref={svgRef}></svg>
        </div>
    );
};
