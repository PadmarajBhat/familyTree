
import React from 'react';
import type { TreeFile } from '../hooks/useHomeTrees';

interface TreeCardProps {
    tree: TreeFile;
    isActive: boolean;
    isStarred: boolean;
    isEditor: boolean;
    onSelect: () => void;
    onToggleStar: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}

export const TreeCard: React.FC<TreeCardProps> = ({ tree, isActive, isStarred, isEditor, onSelect, onToggleStar, onDelete }) => {
    return (
        <div className={`tree-card ${isActive ? 'active' : ''}`} onClick={onSelect}>
            <div className="card-header">
                <h3>{tree.name}</h3>
                <button className={`star-btn ${isStarred ? 'starred' : ''}`} onClick={onToggleStar} title={isStarred ? "Remove from shortlist" : "Add to shortlist"}>
                    ★
                </button>
            </div>
            <div className="card-meta">
                <span>Last modified: {new Date(tree.modifiedTime).toLocaleDateString()}</span>
            </div>
            <div className="card-actions">
                {isEditor && (
                    <button className="delete-btn" onClick={onDelete} title="Delete Today's Version">
                        🗑️
                    </button>
                )}
            </div>
        </div>
    );
};
