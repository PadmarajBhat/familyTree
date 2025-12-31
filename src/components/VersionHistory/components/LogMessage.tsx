
import React from 'react';
import type { ChangeLog, PersonNode } from '../../../logic/types';

interface LogMessageProps {
    log: ChangeLog;
    nodes: Record<string, PersonNode>;
    onSelectNode: (nodeId: string) => void;
}

export const LogMessage: React.FC<LogMessageProps> = ({ log, nodes, onSelectNode }) => {
    const findNodeByName = (name: string) => Object.values(nodes).find(n => n.name?.toLowerCase() === name.toLowerCase());

    if (log.structured && log.structured.length > 0) {
        return (
            <div className="log-changes">
                {log.structured.map((change, i) => {
                    const node = change.nodeId ? nodes[change.nodeId] : null;
                    const suffix = i < (log.structured?.length || 0) - 1 ? '; ' : '';
                    if (!node) {
                        if (log.structured?.length === 1) return <span key={i}>{log.changes}</span>;
                        return <span key={i}>{change.type} member (deleted){suffix}</span>;
                    }
                    const nameLink = <span className="clickable-link" onClick={() => onSelectNode(node.nodeId)} title="View Profile" style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}>{node.name || 'Unknown'}</span>;
                    if (change.type === 'ADD') return <span key={i}>Added {nameLink}{suffix}</span>;
                    if (change.type === 'EDIT') return <span key={i}>Edited {nameLink} with {change.fieldsChanged.join(', ')}{suffix}</span>;
                    if (change.type === 'REPARENT') return <span key={i}>Updated relationships for {nameLink}{suffix}</span>;
                    return <span key={i}>{log.changes}{suffix}</span>;
                })}
            </div>
        );
    }

    const text = log.changes;
    const editMatch = text.match(/^Edited (.+?) with (.+)$/);
    const addMatch = text.match(/^Added (.+)$/);
    let content: React.ReactNode = text;

    if (editMatch) {
        const node = findNodeByName(editMatch[1]);
        if (node) content = <span>Edited <span className="clickable-link" onClick={() => onSelectNode(node.nodeId)} title="View Profile" style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}>{editMatch[1]}</span> with {editMatch[2]}</span>;
    } else if (addMatch) {
        const node = findNodeByName(addMatch[1]);
        if (node) content = <span>Added <span className="clickable-link" onClick={() => onSelectNode(node.nodeId)} title="View Profile" style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}>{addMatch[1]}</span></span>;
    }

    return <div className="log-changes">{content}</div>;
};
