import React, { useMemo } from 'react';
import type { ChangeLog, PersonNode } from '../logic/types';
import { CloseButton } from './CloseButton';
import './VersionHistory.css';

interface VersionHistoryProps {
    summary: ChangeLog[];
    nodes: Record<string, PersonNode>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
}

interface GroupedLog {
    dateCategory: string;
    dateGroups: {
        date: string;
        authorGroups: {
            author: string;
            authorEmail: string;
            logs: ChangeLog[];
        }[];
    }[];
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ summary, nodes, onClose, onSelectNode }) => {

    const groupedLogs = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const groups: Record<string, ChangeLog[]> = {
            'Today': [],
            'This Week': [],
            'This Month': [],
            'Older': []
        };

        summary.forEach(log => {
            const logDate = new Date(log.editedTime);
            // Reset time for comparison
            const logDateOnly = new Date(logDate);
            logDateOnly.setHours(0, 0, 0, 0);

            if (logDateOnly.getTime() === today.getTime()) {
                groups['Today'].push(log);
            } else if (logDate >= oneWeekAgo) {
                groups['This Week'].push(log);
            } else if (logDate >= startOfMonth) {
                groups['This Month'].push(log);
            } else {
                groups['Older'].push(log);
            }
        });

        const result: GroupedLog[] = [];
        const categories = ['Today', 'This Week', 'This Month', 'Older'];

        categories.forEach(category => {
            const logs = groups[category];
            if (logs.length > 0) {
                // Group by date within this category
                const dateMap: Record<string, ChangeLog[]> = {};

                logs.forEach(log => {
                    const dateStr = new Date(log.editedTime).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    if (!dateMap[dateStr]) {
                        dateMap[dateStr] = [];
                    }
                    dateMap[dateStr].push(log);
                });

                // Sort dates descending (newest first)
                const dateGroups = Object.keys(dateMap).map(date => {
                    const dateLogs = dateMap[date];

                    // Group by author within this date
                    const authorMap: Record<string, ChangeLog[]> = {};
                    dateLogs.forEach(log => {
                        const author = log.editedBy || 'Unknown';
                        if (!authorMap[author]) {
                            authorMap[author] = [];
                        }
                        authorMap[author].push(log);
                    });

                    const authorGroups = Object.keys(authorMap).map(author => ({
                        author,
                        authorEmail: author,
                        logs: authorMap[author]
                    }));

                    return {
                        date,
                        authorGroups,
                        timestamp: dateLogs[0] ? new Date(dateLogs[0].editedTime).getTime() : 0
                    };
                }).sort((a, b) => b.timestamp - a.timestamp);

                result.push({
                    dateCategory: category,
                    dateGroups
                });
            }
        });

        return result;
    }, [summary]);

    // Helper to find node by email (for Author)
    const findNodeByEmail = (email: string) => {
        return Object.values(nodes).find(n => n.email?.toLowerCase() === email.toLowerCase());
    };

    // Helper to find node by name (for Root Node - best effort)
    const findNodeByName = (name: string) => {
        return Object.values(nodes).find(n => n.name?.toLowerCase() === name.toLowerCase());
    };

    return (
        <div className="version-history-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 20px 20px' }}>
                <h2>Version History</h2>
                <CloseButton onClick={onClose} />
            </div>

            <div className="version-table-wrapper">
                {summary.length === 0 ? (
                    <div className="empty-state">No history available.</div>
                ) : (
                    <div className="history-list">
                        {groupedLogs.map((group) => (
                            <div key={group.dateCategory} className="history-category">
                                <h3 className="category-header">{group.dateCategory}</h3>
                                {group.dateGroups.map((dateGroup) => (
                                    <div key={dateGroup.date} className="date-group">
                                        <div className="date-header">{dateGroup.date}</div>
                                        {dateGroup.authorGroups.map((authorGroup) => {
                                            const authorNode = findNodeByEmail(authorGroup.authorEmail);
                                            return (
                                                <div key={authorGroup.author} className="author-group">
                                                    <div className="author-header">
                                                        <span className="author-name">
                                                            {authorNode ? (
                                                                <span
                                                                    className="clickable-link"
                                                                    onClick={() => {
                                                                        onSelectNode(authorNode.nodeId);
                                                                        onClose(); // Close history to show detail
                                                                    }}
                                                                    title="View Profile"
                                                                    style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}
                                                                >
                                                                    {authorNode.name}
                                                                </span>
                                                            ) : (
                                                                authorGroup.author
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="author-logs">
                                                        {authorGroup.logs.map((log, idx) => {
                                                            const rootNodeLink = log.rootNodeName ? findNodeByName(log.rootNodeName) : null;
                                                            return (
                                                                <div key={idx} className="log-entry">
                                                                    <div className="log-time">
                                                                        {new Date(log.editedTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                                    </div>
                                                                    <div className="log-content">
                                                                        <div className="log-changes">{log.changes}</div>
                                                                        {log.rootNodeName && (
                                                                            <div className="log-root">
                                                                                Root: {rootNodeLink ? (
                                                                                    <span
                                                                                        className="clickable-link"
                                                                                        onClick={() => {
                                                                                            onSelectNode(rootNodeLink.nodeId);
                                                                                            onClose();
                                                                                        }}
                                                                                        title="View Profile"
                                                                                        style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}
                                                                                    >
                                                                                        {log.rootNodeName}
                                                                                    </span>
                                                                                ) : (
                                                                                    log.rootNodeName
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
