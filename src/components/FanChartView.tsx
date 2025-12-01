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
            .attr("height", height);

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

        const rootData = mode === 'ancestor' ? buildAncestorTree(rootNodeId) : buildDescendantTree(rootNodeId);
        if (!rootData) return;

        const hierarchy = d3.hierarchy(rootData)
            .sum(() => 1)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        const partition = d3.partition<AncestorNode>()
            .size([2 * Math.PI, radius]);

        const root = partition(hierarchy);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arc = d3.arc<d3.HierarchyRectangularNode<AncestorNode>>()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1);

        const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, root.children ? root.children.length + 1 : 1));

        const mainGroup = svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2}) rotate(${rotation})`);

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (event) => {
                mainGroup.attr("transform", `translate(${event.transform.x + width / 2},${event.transform.y + height / 2}) rotate(${rotation}) scale(${event.transform.k})`);
            });

        d3.select(svgRef.current).call(zoom as any);

        const paths = mainGroup.selectAll("g")
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
                    .attr("id", `clip-${d.data.nodeId}`)
                    .append("circle")
                    .attr("cx", centroid[0])
                    .attr("cy", centroid[1] - 15)
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

        // Curved text along arcs
        paths.each(function (d) {
            if (d.depth === 0) {
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
            const r = (d.y0 + d.y1) / 2;
            const startAngle = d.x0;
            const endAngle = d.x1;
            const midAngle = (startAngle + endAngle) / 2;
            const flip = midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2;

            // Calculate arc length
            const arcAngle = endAngle - startAngle;
            const arcLength = r * arcAngle;

            // Build display text
            let displayText = d.data.spouseName
                ? `${d.data.name} & ${d.data.spouseName}`
                : d.data.name || "Unknown";

            // Estimate text width (rough approximation: 6px per character at font-size 9px)
            const estimatedTextWidth = displayText.length * 5.5;

            // Only show text if arc is wide enough
            if (arcLength < 20) {
                // Arc too narrow, skip text entirely
                return;
            }

            // Truncate if needed
            if (estimatedTextWidth > arcLength * 0.9) {
                // Truncate with ellipsis
                const maxChars = Math.floor((arcLength * 0.9) / 5.5);
                if (maxChars < 3) return; // Don't show anything if too small
                displayText = displayText.substring(0, maxChars - 1) + "…";
            }

            const x0 = r * Math.sin(startAngle);
            const y0 = -r * Math.cos(startAngle);
            const x1 = r * Math.sin(endAngle);
            const y1 = -r * Math.cos(endAngle);

            const pathData = flip
                ? `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x0} ${y0}`
                : `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;

            const pathId = `textPath-${d.data.nodeId}`;
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
                .text(displayText);
        });

    }, [data, rootNodeId, dimensions, mode, rotation]);

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
                <div>
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
            </div>
            <svg ref={svgRef}></svg>
        </div>
    );
};
