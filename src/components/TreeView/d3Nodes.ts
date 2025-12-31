import * as d3 from 'd3';
import { getPhotoUrl } from '../../services/drive';
import type { ExtendedHierarchyNode, RenderOptions } from './types';

export const renderNodes = (
    options: RenderOptions,
    nodes: ExtendedHierarchyNode[],
    source: ExtendedHierarchyNode
) => {
    const { g, compact, currentLang, onNodeClick, updateTree, data } = options;

    const node = g.selectAll<SVGGElement, ExtendedHierarchyNode>(".node")
        .data(nodes, (d) => d.data.nodeId);

    const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", () => `translate(${source.x0 || 0},${source.y0 || 0})`);

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
            updateTree(d);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nodeUpdate.transition().duration(200) as any)
        .attr("transform", (d: ExtendedHierarchyNode) => `translate(${d.x},${d.y})`);

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
        .attr("transform", () => `translate(${source.x || 0},${source.y || 0})`)
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    // Stash positions
    nodes.forEach((d) => {
        d.x0 = d.x;
        d.y0 = d.y;
    });

    return { nodeUpdate, nodeExit };
};
