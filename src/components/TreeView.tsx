import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { TreeDocument } from '../logic/types';

interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, onNodeLongPress }) => {
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

        // Build hierarchy
        // We need to convert flat nodes to hierarchy.
        // Root is data.rootNodeId
        const rootNode = data.nodes[data.rootNodeId];
        if (!rootNode) return;

        // Helper to build hierarchy
        const buildHierarchy = (nodeId: string): any => {
            const node = data.nodes[nodeId];
            if (!node) return null;
            const children = node.childrenIds
                .map(buildHierarchy)
                .filter((n): n is any => n !== null);

            return { ...node, children: children.length > 0 ? children : undefined };
        };

        const hierarchyData = buildHierarchy(data.rootNodeId);
        const root = d3.hierarchy(hierarchyData);

        // Tree layout
        const treeLayout = d3.tree().nodeSize([100, 150]); // Width, Height spacing
        treeLayout(root);

        // Center the tree
        // Initial transform
        const initialTransform = d3.zoomIdentity.translate(width / 2, 50).scale(1);
        svg.call(d3.zoom().transform as any, initialTransform);


        // Links
        g.selectAll(".link")
            .data(root.links())
            .enter().append("path")
            .attr("class", "link")
            .attr("d", d3.linkVertical()
                .x((d: any) => d.x)
                .y((d: any) => d.y) as any
            )
            .style("fill", "none")
            .style("stroke", "#ccc")
            .style("stroke-width", "2px");

        // Nodes
        const node = g.selectAll(".node")
            .data(root.descendants())
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", (d: any) => `translate(${d.x},${d.y})`);

        // Node Circle/Rect
        node.append("circle")
            .attr("r", 30)
            .style("fill", "#fff")
            .style("stroke", "steelblue")
            .style("stroke-width", "3px");

        // Image (Clip path needed for circle)
        // For now just text
        node.append("text")
            .attr("dy", ".35em")
            .attr("y", 40)
            .style("text-anchor", "middle")
            .text((d: any) => d.data.name || "Unknown");

        // Interactions
        node.on("pointerdown", (_event, d: any) => {
            const timer = setTimeout(() => {
                onNodeLongPress(d.data.nodeId);
                isLongPress.current = true;
            }, 500);

            // Store timer to clear on up
            (d as any).timer = timer;
        })
            .on("pointerup", (_event, d: any) => {
                if ((d as any).timer) clearTimeout((d as any).timer);
                if (!isLongPress.current) {
                    onNodeClick(d.data.nodeId);
                }
                isLongPress.current = false;
            });

    }, [data]);

    const isLongPress = useRef(false);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
            <svg ref={svgRef}></svg>
        </div>
    );
};
