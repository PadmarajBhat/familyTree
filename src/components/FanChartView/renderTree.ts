import * as d3 from 'd3';
import { getPhotoUrl } from '../../services/drive';
import type { AncestorNode } from './types';

export const renderTreeSector = (
    rootData: AncestorNode,
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    partitionSize: number,
    rotationOffset: number,
    radius: number,
    onNodeClick: (nodeId: string) => void,
    skipCenterText: boolean = false,
    isDescendants: boolean = false
) => {
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

    const badgesGroup = group.append("g")
        .attr("class", "badges-layer")
        .style("pointer-events", "none");

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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // Add children count badge
        const childrenCount = d.data.childrenIds ? d.data.childrenIds.length : 0;
        if (childrenCount > 0) {
            const badgeRadius = 6;
            const badgeAngle = midAngle;
            const badgeR = d.y1; // On the line

            const bx = badgeR * Math.sin(badgeAngle);
            const by = -badgeR * Math.cos(badgeAngle);

            const badge = badgesGroup.append("g")
                .attr("transform", `translate(${bx}, ${by})`);

            badge.append("circle")
                .attr("r", badgeRadius)
                .attr("fill", "#ff4081") // A nice pink/red color
                .attr("stroke", "white")
                .attr("stroke-width", 1);

            badge.append("text")
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .style("font-size", "8px")
                .style("font-weight", "bold")
                .style("fill", "white")
                .text(childrenCount);
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
