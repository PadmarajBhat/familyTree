
import React from 'react';
import type { PersonNode } from '../../../logic/types';
import { calculateAge } from '../../../logic/dateUtils';
import { getPhotoUrl } from '../../../services/drive';
import './CollaboratorCard.css';

interface CollaboratorCardProps {
    node: PersonNode;
    isCurrentEditor: boolean;
    canToggle: boolean;
    isProtected: boolean;
    onToggle: () => void;
    formatDate: (iso: string | null) => string;
}

export const CollaboratorCard: React.FC<CollaboratorCardProps> = ({ node, isCurrentEditor, canToggle, isProtected, onToggle, formatDate }) => {
    const age = calculateAge(node.dob, node.dod);
    const ageText = age !== null ? ` (${age})` : '';
    const imageUrl = getPhotoUrl(node.imageUrl) ?? undefined;

    return (
        <div className="collaborator-card">
            <div className="card-left">
                {imageUrl ? <img src={imageUrl} alt={node.name || 'Member'} className="member-avatar" /> : <div className="member-avatar-placeholder">{node.name ? node.name.charAt(0).toUpperCase() : '?'}</div>}
                <div className="collaborator-info">
                    <div className="collaborator-name">{node.name || 'Unknown'}{ageText}</div>
                    <div className="collaborator-details">
                        <div>{node.email ? `📧 ${node.email}` : '📧 No Email'}</div>
                        <div>{node.phone ? `📞 ${node.phone}` : '📞 No Phone'}</div>
                        {isCurrentEditor && node.editorSince && <div className="editor-since">✓ Editor since {formatDate(node.editorSince)}</div>}
                    </div>
                </div>
            </div>
            <button className={`toggle-button ${isCurrentEditor ? 'remove' : 'add'}`} onClick={onToggle} disabled={!canToggle || isProtected} title={isProtected ? 'Protected' : !canToggle ? 'Restricted' : isCurrentEditor ? 'Remove' : 'Grant'}>
                {isCurrentEditor ? 'Remove' : 'Add'}
            </button>
        </div>
    );
};
