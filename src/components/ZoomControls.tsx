import React from 'react';
import './ZoomControls.css';

interface ZoomControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset?: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ onZoomIn, onZoomOut, onReset }) => {
    return (
        <div className="zoom-controls">
            <button className="zoom-btn" onClick={onZoomIn} title="Zoom In">
                +
            </button>
            <button className="zoom-btn" onClick={onZoomOut} title="Zoom Out">
                -
            </button>
            {onReset && (
                <>
                    <div className="zoom-divider" />
                    <button className="zoom-btn" onClick={onReset} title="Reset View">
                        ⟲
                    </button>
                </>
            )}
        </div>
    );
};
