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
}

export const FanChartView: React.FC<FanChartViewProps> = ({ data, rootNodeId, onNodeClick }) => {
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

        // --- Build Ancestor Hierarchy ---
        // In this hierarchy, "children" are actually parents
        const buildAncestorTree = (nodeId: string, generation: number = 0): AncestorNode | null => {
            const node = data.nodes[nodeId];
            if (!node) return null;

            // Limit generations if needed, e.g., 6-7
            if (generation > 6) {
                return { ...node, generation, children: undefined };
            }

            const parents: AncestorNode[] = [];
            if (node.parentId) {
                // Father (assuming parentId links to father usually, or we need to find both parents)
                // In our data model, parentId points to ONE parent (likely father).
                // We need to find the spouse of the father who is the mother.
                // OR, if we have explicit mother/father fields. 
                // Current model: parentId points to a parent node.

                // Let's try to find both parents.
                // 1. The linked parent
                const parent1 = buildAncestorTree(node.parentId, generation + 1);
                if (parent1) parents.push(parent1);

                // 2. The spouse of the linked parent (Mother)
                // We need to check if the parent has a spouse that is also a parent of this node?
                // Actually, in our model, children are linked to ONE parent (usually father).
                // The mother is the spouse of the father.
                const parentNode = data.nodes[node.parentId];
                if (parentNode && parentNode.spouseIds && parentNode.spouseIds.length > 0) {
                    // Assuming the first spouse is the mother for simplicity, 
                    // or we should check if we can identify the biological mother.
                    // For now, take the first spouse.
                    const spouseId = parentNode.spouseIds[0];
                    const parent2 = buildAncestorTree(spouseId, generation + 1);
                    if (parent2) parents.push(parent2);
                }
            }

            return {
                ...node,
                generation,
                children: parents.length > 0 ? parents : undefined
            };
        };

        const rootData = buildAncestorTree(rootNodeId);
        if (!rootData) return;

        const hierarchy = d3.hierarchy(rootData);

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

        // Draw arcs
        svg.append("g")
            .selectAll("path")
            .data(root.descendants().filter(d => d.depth < 6)) // Limit depth for rendering
            .join("path")
            .attr("fill", d => {
                // Color by generation or lineage
                // return color(d.depth.toString());
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

        // Labels
        svg.append("g")
            .attr("pointer-events", "none")
            .attr("text-anchor", "middle")
            .style("user-select", "none")
            .selectAll("text")
            .data(root.descendants().filter(d => d.depth < 6 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05)) // Filter small arcs
            .join("text")
            .attr("transform", function (d) {
                const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
                const y = (d.y0 + d.y1) / 2;
                return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
            })
            .attr("dy", "0.35em")
            .text(d => d.data.name || "Unknown")
            .style("font-size", d => Math.min(12, (d.x1 - d.x0) * 100) + "px") // Dynamic font size
            .style("fill", "#333");

    }, [data, rootNodeId, dimensions]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9' }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
