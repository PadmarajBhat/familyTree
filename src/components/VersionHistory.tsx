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
    const [viewMode, setViewMode] = React.useState<'date' | 'author'>('date');
    const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set(['date-Today']));

    const toggleSection = (id: string) => {
        const newSet = new Set(expandedSections);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedSections(newSet);
    };

    const groupLogsByDate = (logs: ChangeLog[]): GroupedLog[] => {
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

        logs.forEach(log => {
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
            const categoryLogs = groups[category];
            if (categoryLogs.length > 0) {
                const dateMap: Record<string, ChangeLog[]> = {};

                categoryLogs.forEach(log => {
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

                const dateGroups = Object.keys(dateMap).map(date => {
                    const dateLogs = dateMap[date];
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
    };

    const groupedLogs = useMemo(() => groupLogsByDate(summary), [summary]);

    // Helper to find node by email (for Author)
    const findNodeByEmail = (email: string) => {
        return Object.values(nodes).find(n => n.email?.toLowerCase() === email.toLowerCase());
    };

    // Helper to find node by name (for Root Node - best effort)
    const findNodeByName = (name: string) => {
        return Object.values(nodes).find(n => n.name?.toLowerCase() === name.toLowerCase());
    };

    // Group items by Author -> Then by Date Category using same logic
    const groupedByAuthor = useMemo(() => {
        const authorMap: Record<string, ChangeLog[]> = {};

        summary.forEach(log => {
            const author = log.editedBy || 'Unknown';
            if (!authorMap[author]) {
                authorMap[author] = [];
            }
            authorMap[author].push(log);
        });

        // Convert to array and process each author's logs
        return Object.keys(authorMap).map(author => {
            const authorLogs = authorMap[author];
            const timeGrouped = groupLogsByDate(authorLogs);

            // Find node for name sorting
            const authorNode = findNodeByEmail(author);
            const displayName = authorNode ? authorNode.name : author;

            return {
                author,
                authorEmail: author,
                displayName,
                timeGrouped
            };
        }).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')); // Alphabetical Sort

    }, [summary, nodes]);

    const LogMessage: React.FC<{ log: ChangeLog }> = ({ log }) => {
        // 1. Try to use structured data if available
        if (log.structured && log.structured.length > 0) {
            return (
                <div className="log-changes">
                    {log.structured.map((change, i) => {
                        const node = change.nodeId ? nodes[change.nodeId] : null;
                        const suffix = i < (log.structured?.length || 0) - 1 ? '; ' : '';

                        // Reconstruct message based on type
                        if (!node) {
                            // Node deleted or not found, fallback to plain text reconstruction or original text if single
                            if (log.structured?.length === 1) return <span key={i}>{log.changes}</span>;
                            return <span key={i}>{change.type} member (deleted){suffix}</span>;
                        }

                        const nameLink = (
                            <span
                                className="clickable-link"
                                onClick={() => {
                                    onSelectNode(node.nodeId);
                                }}
                                title="View Profile"
                                style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}
                            >
                                {node.name || 'Unknown'}
                            </span>
                        );

                        if (change.type === 'ADD') {
                            return <span key={i}>Added {nameLink}{suffix}</span>;
                        } else if (change.type === 'EDIT') {
                            const fields = change.fieldsChanged.join(', ');
                            return <span key={i}>Edited {nameLink} with {fields}{suffix}</span>;
                        } else if (change.type === 'REPARENT') {
                            return <span key={i}>Updated relationships for {nameLink}{suffix}</span>;
                        } else {
                            return <span key={i}>{log.changes}{suffix}</span>;
                        }
                    })}
                </div>
            );
        }

        // 2. Fallback: Parse regex for common patterns in plain text
        // "Edited [Name] with..."
        // "Added [Name]"
        const text = log.changes;
        const editMatch = text.match(/^Edited (.+?) with (.+)$/);
        const addMatch = text.match(/^Added (.+)$/);

        let content: React.ReactNode = text;

        if (editMatch) {
            const name = editMatch[1];
            const rest = editMatch[2];
            const node = findNodeByName(name);
            if (node) {
                content = (
                    <span>
                        Edited <span
                            className="clickable-link"
                            onClick={() => {
                                onSelectNode(node.nodeId);
                            }}
                            title="View Profile"
                            style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}
                        >
                            {name}
                        </span> with {rest}
                    </span>
                );
            }
        } else if (addMatch) {
            const name = addMatch[1];
            const node = findNodeByName(name);
            if (node) {
                content = (
                    <span>
                        Added <span
                            className="clickable-link"
                            onClick={() => {
                                onSelectNode(node.nodeId);
                            }}
                            title="View Profile"
                            style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}
                        >
                            {name}
                        </span>
                    </span>
                );
            }
        }

        return <div className="log-changes">{content}</div>;
    };

    const renderDateGroups = (dateGroups: { date: string; authorGroups: { author: string; authorEmail: string; logs: ChangeLog[] }[] }[]) => {
        return dateGroups.map((dateGroup) => (
            <div key={dateGroup.date} className="date-group">
                <div className="date-header">{dateGroup.date}</div>
                {dateGroup.authorGroups.map((authorGroup) => {
                    const authorNode = findNodeByEmail(authorGroup.authorEmail);
                    return (
                        <div key={authorGroup.author} className="author-group">
                            {viewMode === 'date' && (
                                <div className="author-header">
                                    <span className="author-name">
                                        {authorNode ? (
                                            <span
                                                className="clickable-link"
                                                onClick={() => {
                                                    onSelectNode(authorNode.nodeId);
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
                            )}
                            <div className="author-logs">
                                {authorGroup.logs.map((log, idx) => {
                                    const rootNodeLink = log.rootNodeName ? findNodeByName(log.rootNodeName) : null;
                                    return (
                                        <div key={idx} className="log-entry">
                                            <div className="log-time">
                                                {new Date(log.editedTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="log-content">
                                                <LogMessage log={log} />
                                                {log.rootNodeName && (
                                                    <div className="log-root">
                                                        Root: {rootNodeLink ? (
                                                            <span
                                                                className="clickable-link"
                                                                onClick={() => {
                                                                    onSelectNode(rootNodeLink.nodeId);
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
        ));
    };

    const renderHistoryList = (groups: GroupedLog[]) => {
        return groups.map((group) => {
            return (
                <div key={group.dateCategory} className="history-category">
                    {viewMode === 'date' ? (
                        <>
                            <div
                                className="category-header clickable-header"
                                onClick={() => toggleSection(`date-${group.dateCategory}`)}
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                                <span className={`arrow ${expandedSections.has(`date-${group.dateCategory}`) ? 'expanded' : ''}`}>▶</span>
                                <span style={{ marginLeft: '8px' }}>{group.dateCategory}</span>
                            </div>
                            {expandedSections.has(`date-${group.dateCategory}`) && (
                                <div className="category-content">
                                    {renderDateGroups(group.dateGroups)}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="category-content">
                            <h4 className="category-subheader" style={{ marginTop: '12px', marginBottom: '8px', color: '#666', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.dateCategory}</h4>
                            {renderDateGroups(group.dateGroups)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="version-history-container">
            <div style={{ padding: '16px 20px 0 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0 }}>Version History</h2>
                    <CloseButton onClick={onClose} />
                </div>

                <div className="vh-tabs">
                    <button
                        className={`vh-tab ${viewMode === 'date' ? 'active' : ''}`}
                        onClick={() => setViewMode('date')}
                    >
                        By Date
                    </button>
                    <button
                        className={`vh-tab ${viewMode === 'author' ? 'active' : ''}`}
                        onClick={() => setViewMode('author')}
                    >
                        By Author
                    </button>
                </div>
            </div>

            <div className="version-table-wrapper" style={{ height: 'calc(100% - 110px)' }}> {/* Adjust height for tabs */}
                {summary.length === 0 ? (
                    <div className="empty-state">No history available.</div>
                ) : (
                    <div className="history-list">
                        {viewMode === 'date' ? (
                            renderHistoryList(groupedLogs)
                        ) : (
                            <div className="author-list">
                                {groupedByAuthor.map(authorBlock => {
                                    const isExpanded = expandedSections.has(`author-${authorBlock.authorEmail}`);
                                    return (
                                        <div key={authorBlock.author} className="author-block" style={{ marginBottom: '16px' }}>
                                            <div
                                                className="author-block-header"
                                                onClick={() => toggleSection(`author-${authorBlock.authorEmail}`)}
                                                style={{
                                                    padding: '12px',
                                                    background: '#f5f5f5',
                                                    borderRadius: '4px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <span className={`arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
                                                    <span style={{ marginLeft: '12px' }}>{authorBlock.displayName}</span>
                                                    <span style={{ fontWeight: 'normal', fontSize: '0.9em', color: '#666', marginLeft: '8px' }}>
                                                        ({authorBlock.authorEmail})
                                                    </span>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ paddingLeft: '8px', paddingTop: '8px' }}>
                                                    {renderHistoryList(authorBlock.timeGrouped)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
