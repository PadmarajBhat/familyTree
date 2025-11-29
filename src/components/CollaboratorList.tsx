import type { PersonNode } from '../logic/types';
import { calculateAge } from '../logic/dateUtils';
import { CloseButton } from './CloseButton';
import './CollaboratorList.css';

interface CollaboratorListProps {
    nodes: Record<string, PersonNode>;
    currentUserEmail: string;
    canToggle: boolean;
    onToggleEditor: (nodeId: string, newStatus: boolean) => void;
    onClose: () => void;
}

export function CollaboratorList({ nodes, canToggle, onToggleEditor, onClose }: CollaboratorListProps) {
    const allMembers = Object.values(nodes);

    // Separate editors and non-editors
    const editors = allMembers.filter(node => node.isEditor);
    const nonEditors = allMembers.filter(node => !node.isEditor);

    const formatDate = (isoString: string | null) => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const renderMemberCard = (node: PersonNode, isCurrentEditor: boolean) => {
        const age = calculateAge(node.dob, node.dod);
        const ageText = age !== null ? ` (${age})` : '';

        return (
            <div key={node.nodeId} className="collaborator-card">
                <div className="collaborator-info">
                    <div className="collaborator-name">
                        {node.name || 'Unknown'}{ageText}
                    </div>
                    <div className="collaborator-details">
                        <div>📞 {node.phone || 'N/A'}</div>
                        {isCurrentEditor && node.editorSince && (
                            <div className="editor-since">
                                ✓ Editor since {formatDate(node.editorSince)}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    className={`toggle-button ${isCurrentEditor ? 'remove' : 'add'}`}
                    onClick={() => onToggleEditor(node.nodeId, !isCurrentEditor)}
                    disabled={!canToggle}
                    title={canToggle ? (isCurrentEditor ? 'Remove editor access' : 'Grant editor access') : 'Only editors can modify permissions'}
                >
                    {isCurrentEditor ? 'Remove' : 'Add'}
                </button>
            </div>
        );
    };

    return (
        <div className="collaborator-overlay" onClick={onClose}>
            <div className="collaborator-container" onClick={(e) => e.stopPropagation()}>
                <div className="collaborator-header">
                    <h2>Editors</h2>
                    <CloseButton onClick={onClose} />
                </div>

                {!canToggle && (
                    <div className="info-banner">
                        ℹ️ You can view collaborators but only editors can modify permissions
                    </div>
                )}

                <div className="collaborator-content">
                    <div className="section">
                        <h3>Current Editors ({editors.length})</h3>
                        {editors.length === 0 ? (
                            <div className="empty-state">No editors found</div>
                        ) : (
                            <div className="collaborator-list">
                                {editors.map(node => renderMemberCard(node, true))}
                            </div>
                        )}
                    </div>

                    <div className="section">
                        <h3>Members ({nonEditors.length})</h3>
                        {nonEditors.length === 0 ? (
                            <div className="empty-state">No members found</div>
                        ) : (
                            <div className="collaborator-list">
                                {nonEditors.map(node => renderMemberCard(node, false))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
