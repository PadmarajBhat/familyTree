import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { ZoomControls } from '../ZoomControls';
import type { TreeViewProps } from './types';
import { useTreeRenderer } from './useTreeRenderer';

export const TreeView: React.FC<TreeViewProps> = (props) => {
    const { isExporting, showControls = true } = props;
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const { i18n } = useTranslation();
    const currentLang = i18n.language;

    useTreeRenderer(svgRef as React.RefObject<SVGSVGElement>, wrapperRef as React.RefObject<HTMLDivElement>, dimensions, props, currentLang, zoomBehavior);

    useEffect(() => {
        if (!wrapperRef.current) return;
        let lastWidth = 0, lastHeight = 0;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (Math.abs(width - lastWidth) > 5 || Math.abs(height - lastHeight) > 5) {
                    lastWidth = width; lastHeight = height;
                    requestAnimationFrame(() => setDimensions({ width, height }));
                }
            }
        });
        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const handleZoomIn = () => svgRef.current && zoomBehavior.current && d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 1.2);
    const handleZoomOut = () => svgRef.current && zoomBehavior.current && d3.select(svgRef.current).transition().call(zoomBehavior.current.scaleBy, 0.8);
    const handleReset = () => {
        if (svgRef.current && zoomBehavior.current && wrapperRef.current) {
            const t = d3.zoomIdentity.translate(wrapperRef.current.clientWidth / 2, 50).scale(1);
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
                <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={handleReset} />
            )}
        </div>
    );
};
export default TreeView;
