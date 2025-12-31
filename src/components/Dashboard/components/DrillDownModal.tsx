
import React from 'react';
import type { PersonNode } from '../../../logic/types';
import { getPhotoUrl } from '../../../services/drive';

interface DrillDownModalProps {
    title: string;
    members: PersonNode[];
    onClose: () => void;
    onNodeClick: (nodeId: string) => void;
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({ title, members, onClose, onNodeClick }) => {
    return (
        <div className="drilldown-overlay" onClick={onClose}>
            <div className="drilldown-modal" onClick={e => e.stopPropagation()}>
                <div className="drilldown-header">
                    <h3>{title} Members</h3>
                    <button onClick={onClose} className="drilldown-close">×</button>
                </div>
                <div className="drilldown-list">
                    {members.map(member => (
                        <div key={member.nodeId} className="drilldown-item" onClick={() => { onNodeClick(member.nodeId); onClose(); }}>
                            {member.imageUrl ? (
                                <img src={getPhotoUrl(member.imageUrl) || ""} alt="" className="drilldown-avatar" />
                            ) : (
                                <div className="drilldown-avatar">{member.name?.charAt(0)}</div>
                            )}
                            <div className="drilldown-name">{member.name}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
