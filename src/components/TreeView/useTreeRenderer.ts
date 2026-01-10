import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getPhotoUrl } from '../../services/drive';
import type { TreeViewProps, HierarchyPersonNode, ExtendedHierarchyNode } from './types';

export const useTreeRenderer = (
    svgRef: React.RefObject<SVGSVGElement>,
    wrapperRef: React.RefObject<HTMLDivElement>,
    dimensions: { width: number; height: number },
    props: TreeViewProps,
    currentLang: string,
    zoomBehavior: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
) => {
    const { data, onNodeClick, maxDepth, isExporting, compact, path } = props;

    useEffect(() => {
        if (!data || !svgRef.current || !wrapperRef.current) return;

        const { width, height } = (dimensions.width > 0 && !isExporting) ? dimensions : {
            width: wrapperRef.current.clientWidth || 1000,
            height: wrapperRef.current.clientHeight || 800
        };
        if (width === 0 || height === 0) return;

        d3.select(svgRef.current).selectAll("*").remove();
        const svg = d3.select(svgRef.current).attr("width", width).attr("height", height);
        const g = svg.append("g");

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .filter((e) => e.type !== 'wheel' && e.type !== 'dblclick' && !e.ctrlKey && !e.button)
            .on("zoom", (e) => g.attr("transform", e.transform));

        zoomBehavior.current = zoom;
        if (!isExporting) svg.call(zoom as any);

        const buildHierarchy = (nodeId: string, visited: Set<string> = new Set()): HierarchyPersonNode | null => {
            const node = data.nodes[nodeId];
            if (!node || visited.has(nodeId)) return null;
            visited.add(nodeId);

            const allChildrenIds = new Set(node.childrenIds);
            node.spouseIds.forEach(spId => {
                data.nodes[spId]?.childrenIds?.forEach(id => allChildrenIds.add(id));
            });

            const children = Array.from(allChildrenIds)
                .map(id => buildHierarchy(id, new Set(visited)))
                .filter((n): n is HierarchyPersonNode => n !== null);

            children.sort((a, b) => {
                const partsA = a.dob?.split('-').reverse().join('') || '';
                const partsB = b.dob?.split('-').reverse().join('') || '';
                return partsA.localeCompare(partsB);
            });

            return { ...node, children: children.length > 0 ? children : undefined, childrenCount: children.length };
        };

        const hierarchyData = buildHierarchy(data.rootNodeId);
        if (!hierarchyData) return;

        const root = d3.hierarchy(hierarchyData) as ExtendedHierarchyNode;
        root.x0 = width / 2;
        root.y0 = 0;

        if (maxDepth) {
            root.descendants().forEach((d) => {
                if (d.depth >= maxDepth && d.children) { d._children = d.children; d.children = undefined; }
                else if (d._children) { d.children = d._children; d._children = undefined; }
            });
        }

        const nodeWidth = compact ? 140 : 160;
        const nodeHeight = compact ? 120 : 200;
        const treeLayout = d3.tree<HierarchyPersonNode>().nodeSize([nodeWidth, nodeHeight]);
        const safeLink = d3.linkVertical().x((d: any) => d.x || 0).y((d: any) => d.y || 0) as any;

        const update = (source: ExtendedHierarchyNode) => {
            const treeData = treeLayout(root);
            const nodes = treeData.descendants() as ExtendedHierarchyNode[];
            const links = treeData.links().filter(l => l.source.data.nodeId !== 'VIRTUAL_ROOT');

            const jumpLinks: any[] = [];
            if (path && path.length > 1) {
                const nodeMap = new Map<string, ExtendedHierarchyNode>();
                nodes.forEach(n => nodeMap.set(n.data.nodeId, n));
                for (let i = 0; i < path.length - 1; i++) {
                    const u = nodeMap.get(path[i]), v = nodeMap.get(path[i + 1]);
                    if (u?.x !== undefined && v?.x !== undefined) {
                        const isConnected = links.some(l => (l.source.data.nodeId === path[i] && l.target.data.nodeId === path[i + 1]) || (l.source.data.nodeId === path[i + 1] && l.target.data.nodeId === path[i]));
                        if (!isConnected) jumpLinks.push({ source: { x: u.x, y: u.y }, target: { x: v.x, y: v.y } });
                    }
                }
            }

            const node = g.selectAll<SVGGElement, ExtendedHierarchyNode>(".node").data(nodes, (d) => d.data.nodeId);
            const nodeEnter = node.enter().append("g").attr("class", "node").attr("transform", () => `translate(${source.x0},${source.y0})`);

            nodeEnter.each(function (d) {
                if (d.data.nodeId === 'VIRTUAL_ROOT') return;
                const mainGroup = d3.select(this).append("g").style("cursor", "pointer").on("click", (e) => { e.stopPropagation(); onNodeClick(d.data.nodeId); });
                const defs = d3.select(this).append("defs");
                const circleRadius = compact ? 20 : 30;

                const addPattern = (id: string, imgUrl: string) => {
                    defs.append("pattern").attr("id", `pattern-${id}`).attr("height", "100%").attr("width", "100%").attr("patternContentUnits", "objectBoundingBox")
                        .append("image").attr("height", 1).attr("width", 1).attr("preserveAspectRatio", "none").attr("href", getPhotoUrl(imgUrl));
                };

                if (d.data.imageUrl) addPattern(d.data.nodeId, d.data.imageUrl);
                const spouseNode = d.data.spouseIds?.[0] ? data.nodes[d.data.spouseIds[0]] : null;
                if (spouseNode?.imageUrl) addPattern(spouseNode.nodeId, spouseNode.imageUrl);

                if (spouseNode) {
                    mainGroup.append("circle").attr("cx", compact ? 15 : 20).attr("r", circleRadius).style("fill", spouseNode.imageUrl ? `url(#pattern-${spouseNode.nodeId})` : "#fff").style("stroke", "pink").style("stroke-width", "3px");
                    mainGroup.append("circle").attr("cx", compact ? -15 : -20).attr("r", circleRadius).style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff").style("stroke", "steelblue").style("stroke-width", "3px");
                } else {
                    mainGroup.append("circle").attr("r", circleRadius).style("fill", d.data.imageUrl ? `url(#pattern-${d.data.nodeId})` : "#fff").style("stroke", "steelblue").style("stroke-width", "3px");
                }

                const xOffset = compact ? (spouseNode ? 30 : 15) : (spouseNode ? 40 : 20);
                const badge = mainGroup.append("g").attr("class", "badge").attr("transform", `translate(${xOffset}, ${compact ? -15 : -20})`).style("display", (d.data.childrenCount || 0) > 0 ? "block" : "none");
                badge.append("circle").attr("r", compact ? 8 : 10).style("fill", "red").style("stroke", "white");
                badge.append("text").attr("dy", ".35em").style("text-anchor", "middle").style("fill", "white").style("font-size", compact ? "8px" : "10px").style("font-weight", "bold").text(d.data.childrenCount ?? "");

                const mainName = (currentLang && d.data.nameTranslations?.[currentLang]) || d.data.name || "Unknown";
                mainGroup.append("text").attr("dy", ".35em").attr("y", compact ? 30 : 45).style("text-anchor", "middle").text(mainName).style("font-size", compact ? "10px" : "12px").style("font-weight", "bold").style("text-shadow", "0 1px 0 #fff");
                if (spouseNode) {
                    const spName = (currentLang && spouseNode.nameTranslations?.[currentLang]) || spouseNode.name || "Unknown";
                    mainGroup.append("text").attr("dy", ".35em").attr("y", compact ? 42 : 60).style("text-anchor", "middle").text(`& ${spName}`).style("font-size", compact ? "9px" : "11px").style("fill", "#555").style("text-shadow", "0 1px 0 #fff");
                }
            });

            const toggle = nodeEnter.append("g").attr("class", "toggle-btn").attr("transform", (d) => `translate(0, ${d.data.spouseIds?.length ? 75 : 55})`).style("cursor", "pointer").style("display", (d) => (d.children || d._children) ? "block" : "none").on("click", (e, d) => {
                e.stopPropagation();
                if (d.children) { d._children = d.children; d.children = undefined; }
                else { d.children = d._children || undefined; d._children = undefined; }
                update(d);
            });
            toggle.append("circle").attr("r", 8).style("fill", "white").style("stroke", "steelblue");
            toggle.append("text").attr("dy", ".35em").style("text-anchor", "middle").style("font-size", "10px").style("font-weight", "bold").style("fill", "steelblue").text(d => d._children ? "+" : "-");

            const nodeUpdate = nodeEnter.merge(node);
            nodeUpdate.transition().duration(200).attr("transform", (d) => `translate(${d.x},${d.y})`);
            nodeUpdate.select(".toggle-btn").style("display", (d) => (d.children || d._children) ? "block" : "none");
            nodeUpdate.select(".toggle-btn text").text((d) => d._children ? "+" : "-");

            node.exit().transition().duration(200).attr("transform", () => `translate(${source.x},${source.y})`).remove();

            const link = g.selectAll<SVGPathElement, any>(".link").data(links, (d) => d.target.data.nodeId);
            link.enter().insert("path", "g").attr("class", "link").attr("d", () => {
                const o = { x: source.x0 || 0, y: source.y0 || 0 };
                return safeLink({ source: o, target: o });
            }).merge(link as any).transition().duration(200).attr("d", safeLink);
            link.exit().transition().duration(200).attr("d", () => {
                const o = { x: source.x || 0, y: source.y || 0 };
                return safeLink({ source: o, target: o });
            }).remove();

            const jl = g.selectAll<SVGPathElement, any>(".jump-link").data(jumpLinks, (d: any) => `${d.source.x}-${d.source.y}-${d.target.x}-${d.target.y}`);
            jl.enter().insert("path", "g").attr("class", "jump-link").style("fill", "none").style("stroke", "#2ecc71").style("stroke-width", "3px").style("stroke-dasharray", "5,5")
                .merge(jl as any).transition().duration(200).attr("d", (d: any) => `M${d.source.x},${d.source.y} Q${(d.source.x + d.target.x) / 2},${d.target.y + 100} ${d.target.x},${d.target.y}`);
            jl.exit().remove();

            nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
        };

        const centerTree = () => {
            const nodes = root.descendants() as ExtendedHierarchyNode[];
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodes.forEach(d => {
                if (d.x !== undefined) { minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x); }
                if (d.y !== undefined) { minY = Math.min(minY, d.y); maxY = Math.max(maxY, d.y); }
            });
            const padding = 50;
            if (isExporting) {
                svg.attr("width", (maxX - minX) + padding * 2).attr("height", (maxY - minY) + padding * 2);
                g.attr("transform", `translate(${-minX + padding},${-minY + padding})`);
            } else {
                const scale = Math.min(Math.max((width - padding * 2) / (maxX - minX || 1), 0.2), 1.2);
                const tx = width / 2 - ((minX + maxX) / 2) * scale;
                svg.transition().duration(750).call(zoom.transform as any, d3.zoomIdentity.translate(tx, 50).scale(scale));
            }
        };

        update(root);
        centerTree();
    }, [data, maxDepth, dimensions, isExporting, compact, currentLang]);
};
