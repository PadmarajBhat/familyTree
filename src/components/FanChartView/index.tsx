import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ZoomControls } from '../ZoomControls';
import type { FanChartViewProps } from './types';
import { buildAncestorTree, buildDescendantTree } from './dataBuilders';
import { renderTreeSector } from './renderTree';
import { renderCenterNode } from './renderCenter';

export const FanChartView: React.FC<FanChartViewProps> = ({ data, rootNodeId, onNodeClick, onResetRoot }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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

    const handleReset = () => {
        if (onResetRoot) {
            onResetRoot();
        }
        if (svgRef.current && zoomBehavior.current) {
            d3.select(svgRef.current)
                .transition()
                .duration(750)
                .call(zoomBehavior.current.transform, d3.zoomIdentity);
        }
    };

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

        const mainGroup = svg.append("g")
            .attr("class", "main-group")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        // Zoom only (no rotation)
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 3])
            .filter((event) => {
                // Ignore wheel events
                if (event.type === 'wheel') return false;
                // Ignore double click
                if (event.type === 'dblclick') return false;
                // Allow mousedown/touchstart for panning
                return !event.ctrlKey && !event.button;
            })
            .on("zoom", (event) => {
                // Keep the initial center translation, add zoom transform
                mainGroup.attr("transform",
                    `translate(${width / 2 + event.transform.x},${height / 2 + event.transform.y}) scale(${event.transform.k})`);
            });

        zoomBehavior.current = zoom;

        d3.select(svgRef.current)
            .call(zoom as any);

        // Always render in hourglass mode
        const ancestorData = buildAncestorTree(data, rootNodeId);
        const descendantData = buildDescendantTree(data, rootNodeId);

        if (ancestorData) {
            renderTreeSector(ancestorData, mainGroup, Math.PI, -90, radius, onNodeClick, true, false);
        }
        if (descendantData) {
            renderTreeSector(descendantData, mainGroup, Math.PI, 90, radius, onNodeClick, true, true);
        }

        // Manually render center text for Hourglass
        if (ancestorData || descendantData) {
            const rootNode = ancestorData || descendantData;
            if (rootNode) {
                renderCenterNode(rootNode, mainGroup);
            }
        }

    }, [data, rootNodeId, dimensions, onNodeClick]);

    return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', background: '#f9f9f9', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>💡 Click nodes to view details</span>
            </div>
            <ZoomControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onReset={handleReset}
            />
            <svg ref={svgRef}></svg>
        </div>
    );
};
