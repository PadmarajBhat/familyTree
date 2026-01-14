import React, { useEffect, useState } from 'react';
import type { PersonNode } from '../logic/types';
import { CloseButton } from './CloseButton';
import './VersionHistory.css';
import { TreeService } from '../services/TreeService';

interface VersionHistoryProps {
    summary: any[]; // Deprecated, but keeping for compatibility if passed
    nodes: Record<string, PersonNode>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
    filterNodeId?: string | null;
    treeName?: string;
    treeId?: string; // We need treeId to fetch history
}

interface AuditLog {
    treeId: string;
    action: string;
    userEmail: string;
    summary: string;
    targetNodeId?: string;
    details?: any;
    timestamp: string; // ISO
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ nodes, onClose, onSelectNode, filterNodeId, treeName, treeId }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadHistory = async () => {
            if (!treeId) return;
            setLoading(true);
            try {
                const fetched = await TreeService.fetchHistory(treeId, filterNodeId || undefined);
                // Client-side sort just in case
                fetched.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setLogs(fetched);
            } catch (e) {
                console.error("Failed to load history", e);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [treeId, filterNodeId]);

    // Helper to find node by email (for Author)
    const findNodeByEmail = (email: string) => {
        return Object.values(nodes).find(n => n.email?.toLowerCase() === email.toLowerCase());
    };

    const findNodeById = (id: string) => nodes[id];

    // Render a single log entry
    const renderLogContent = (log: AuditLog) => {
        const authorNode = findNodeByEmail(log.userEmail);
        const targetNode = log.targetNodeId ? findNodeById(log.targetNodeId) : null;

        const authorLink = (
            <span
                className="clickable-link"
                onClick={() => authorNode ? onSelectNode(authorNode.nodeId) : null}
                style={{
                    cursor: authorNode ? 'pointer' : 'default',
                    color: authorNode ? '#2196f3' : '#333',
                    textDecoration: authorNode ? 'underline' : 'none',
                    fontWeight: 500
                }}
                title={log.userEmail}
            >
                {authorNode ? authorNode.name : (log.userEmail || 'Unknown User')}
            </span>
        );

        const targetLink = log.targetNodeId ? (
            <span
                className="clickable-link"
                onClick={() => onSelectNode(log.targetNodeId!)}
                style={{
                    cursor: 'pointer',
                    color: '#2196f3',
                    textDecoration: 'underline',
                    fontWeight: 500
                }}
            >
                {targetNode ? targetNode.name : 'Deleted Person'}
            </span>
        ) : null;

        // "X updated Y with ..." 
        // We can reconstruct mostly from action and summary
        const diffKeys = log.details ? Object.keys(log.details).join(', ') : '';
        const detailText = diffKeys ? `(${diffKeys})` : '';

        return (
            <div className="log-changes">
                {authorLink}
                {log.action === 'ADD' && <span> added {targetLink}</span>}
                {log.action === 'DELETE' && <span> deleted {targetLink}</span>}
                {log.action === 'EDIT' && <span> updated {targetLink} {detailText}</span>}
                {!['ADD', 'DELETE', 'EDIT'].includes(log.action) && <span> performed {log.action} on {targetLink}</span>}
            </div>
        );
    };

    return (
        <div className="version-history-container">
            <div style={{ padding: '16px 20px 0 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ margin: 0 }}>
                            {treeName ? `${treeName}: ` : ''}
                            {filterNodeId && nodes[filterNodeId]
                                ? `History of ${nodes[filterNodeId].name}`
                                : "Version History"
                            }
                        </h2>
                    </div>
                    <CloseButton onClick={onClose} />
                </div>
            </div>

            <div className="version-table-wrapper" style={{ height: 'calc(100% - 70px)', overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Loading history...</div>
                ) : logs.length === 0 ? (
                    <div className="empty-state">No history available.</div>
                ) : (
                    <div className="history-list">
                        {logs.map((log, i) => (
                            <div key={i} className="log-entry" style={{ padding: '10px 20px', borderBottom: '1px solid #eee' }}>
                                <div className="log-time" style={{ fontSize: '0.8em', color: '#888', marginBottom: '4px' }}>
                                    {new Date(log.timestamp).toLocaleString()}
                                </div>
                                <div className="log-content">
                                    {renderLogContent(log)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
