import * as d3 from 'd3';
import { getPhotoUrl } from '../../services/drive';
import type { AncestorNode } from './types';

export const renderCenterNode = (
    rootNode: AncestorNode,
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>
) => {
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
};
