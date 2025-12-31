import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { ZoomControls } from '../ZoomControls';
import type { TreeViewProps, ExtendedHierarchyNode } from './types';
import { buildHierarchy } from './dataBuilders';
import { renderTree } from './d3Render';

export const TreeView: React.FC<TreeViewProps> = ({ data, onNodeClick, maxDepth, isExporting, compact, path, showControls = true }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const { i18n } = useTranslation();
    const currentLang = i18n.language;

    // Resize Observer
    useEffect(() => {
        if (!wrapperRef.current) return;

        let lastWidth = 0;
        let lastHeight = 0;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (Math.abs(width - lastWidth) > 5 || Math.abs(height - lastHeight) > 5) {
                    lastWidth = width;
                    lastHeight = height;
                    requestAnimationFrame(() => {
                        setDimensions({ width, height });
                    });
                }
            }
        });

        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Main Render Effect
    useEffect(() => {
        if (!data || !svgRef.current || !wrapperRef.current) return;

        const { width, height } = (dimensions.width > 0 && !isExporting) ? dimensions : {
            width: wrapperRef.current.clientWidth || 1000,
            height: wrapperRef.current.clientHeight || 800
        };

        if (width === 0 || height === 0) return;

        // Cleanup
        d3.select(svgRef.current).selectAll("*").remove();

        // SVG Setup
        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        // Zoom Behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .filter((event) => {
                if (event.type === 'wheel') return false;
                if (event.type === 'dblclick') return false;
                return !event.ctrlKey && !event.button;
            })
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        zoomBehavior.current = zoom;

        if (!isExporting) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            svg.call(zoom as any);
        }

        // Data Prep
        const hierarchyData = buildHierarchy(data, data.rootNodeId);
        if (!hierarchyData) return;

        const root = d3.hierarchy(hierarchyData) as ExtendedHierarchyNode;
        root.x0 = width / 2;
        root.y0 = 0;

        if (maxDepth) {
            root.descendants().forEach((d) => {
                if (d.depth >= maxDepth) {
                    if (d.children) {
                        d._children = d.children;
                        d.children = undefined;
                    }
                } else if (d._children) {
                    d.children = d._children;
                    d._children = undefined;
                }
            });
        }

        // Render Function Wrapper for Recursive Updates
        const update = (_source: ExtendedHierarchyNode) => {
            renderTree({
                svg,
                g,
                root,
                data,
                width,
                height,
                compact,
                path,
                currentLang,
                onNodeClick,
                updateTree: update
            });

            // Center Tree logic here? Or initial center only?
            // Usually we center initially.
        };

        update(root);

        // Initial Centering Logic
        const centerTree = () => {
            // Need computed 'nodes' from D3 layout (which happens inside renderTree)
            // But we can re-compute or access from root since 'update' modifies root in place via d3 layout
            const nodes = root.descendants() as ExtendedHierarchyNode[];
            let minX = Infinity, maxX = -Infinity;
            nodes.forEach((d) => {
                if (d.x !== undefined) {
                    minX = Math.min(minX, d.x);
                    maxX = Math.max(maxX, d.x);
                }
            });

            const padding = 50;
            const treeWidth = maxX - minX;

            if (isExporting) {
                // ... strict export centering logic ...
                let minY = Infinity, maxY = -Infinity;
                nodes.forEach(d => {
                    if (d.y !== undefined) {
                        minY = Math.min(minY, d.y);
                        maxY = Math.max(maxY, d.y);
                    }
                });
                const tH = (maxY - minY) + padding * 2;
                const tW = (maxX - minX) + padding * 2;
                svg.attr("width", tW).attr("height", tH);
                g.attr("transform", `translate(${-minX + padding},${-minY + padding})`);
            } else {
                const availableWidth = width - padding * 2;
                const scaleX = availableWidth / (treeWidth || 1);
                const scale = Math.min(Math.max(scaleX, 0.2), 1.2);

                const centerX = (minX + maxX) / 2;
                const translateX = width / 2 - centerX * scale;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                svg.transition().duration(750)
                    .call(zoom.transform as any, d3.zoomIdentity.translate(translateX, 50).scale(scale));
            }
        };

        centerTree();

    }, [data, maxDepth, dimensions, isExporting, compact, currentLang]);

    const handleZoomIn = () => {
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 1.2);
        }
    };

    const handleZoomOut = () => {
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 0.8);
        }
    };

    const handleReset = () => {
        if (svgRef.current && zoomBehavior.current && wrapperRef.current) {
            const width = wrapperRef.current.clientWidth;
            const t = d3.zoomIdentity.translate(width / 2, 50).scale(1);
            d3.select(svgRef.current).transition().duration(750).call(zoomBehavior.current.transform, t);
        }
    };

    return (
        <div ref={wrapperRef} style={{
            width: isExporting ? 'auto' : '100%',
            height: isExporting ? 'auto' : '100%',
            overflow: isExporting ? 'visible' : 'hidden',
            background: '#f9f9f9',
            minHeight: isExporting ? '100px' : undefined,
            position: 'relative'
        }}>
            <svg ref={svgRef}></svg>
            {!isExporting && showControls && (
                <ZoomControls
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onReset={handleReset}
                />
            )}
        </div>
    );
};
