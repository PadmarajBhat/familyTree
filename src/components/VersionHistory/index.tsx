
import React from 'react';
import type { ChangeLog, PersonNode } from '../../logic/types';
import { CloseButton } from '../CloseButton';
import { useVersionHistory, type GroupedLog } from './hooks/useVersionHistory';
import { LogMessage } from './components/LogMessage';
import './VersionHistory.css';

interface VersionHistoryProps {
    summary: ChangeLog[];
    nodes: Record<string, PersonNode>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
    filterNodeId?: string | null;
    treeName?: string;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ summary = [], nodes, onClose, onSelectNode, filterNodeId, treeName }) => {
    const { viewMode, setViewMode, expandedSections, toggleSection, groupedLogs, groupedByAuthor } = useVersionHistory(summary, nodes, filterNodeId);

    const renderDateGroups = (dateGroups: any[]) => dateGroups.map((dateGroup) => (
        <div key={dateGroup.date} className="date-group">
            <div className="date-header">{dateGroup.date}</div>
            {dateGroup.authorGroups.map((authorGroup: any) => {
                const authorNode = Object.values(nodes).find(n => n.email?.toLowerCase() === authorGroup.authorEmail.toLowerCase());
                return (
                    <div key={authorGroup.author} className="author-group">
                        {viewMode === 'date' && (
                            <div className="author-header">
                                <span className="author-name">
                                    {authorNode ? <span className="clickable-link" onClick={() => onSelectNode(authorNode.nodeId)} title="View Profile" style={{ cursor: 'pointer', color: '#2196f3', textDecoration: 'underline' }}>{authorNode.name}</span> : authorGroup.author}
                                </span>
                            </div>
                        )}
                        <div className="author-logs">
                            {authorGroup.logs.map((log: ChangeLog, idx: number) => (
                                <div key={idx} className="log-entry">
                                    <div className="log-time">{new Date(log.editedTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="log-content"><LogMessage log={log} nodes={nodes} onSelectNode={onSelectNode} /></div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    ));

    const renderHistoryList = (groups: GroupedLog[]) => groups.map((group) => (
        <div key={group.dateCategory} className="history-category">
            {viewMode === 'date' ? (
                <>
                    <div className="category-header clickable-header" onClick={() => toggleSection(`date-${group.dateCategory}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <span className={`arrow ${expandedSections.has(`date-${group.dateCategory}`) ? 'expanded' : ''}`}>▶</span>
                        <span style={{ marginLeft: '8px' }}>{group.dateCategory}</span>
                    </div>
                    {expandedSections.has(`date-${group.dateCategory}`) && <div className="category-content">{renderDateGroups(group.dateGroups)}</div>}
                </>
            ) : (
                <div className="category-content">
                    <h4 className="category-subheader" style={{ marginTop: '12px', marginBottom: '8px', color: '#666', fontSize: '0.9em', textTransform: 'uppercase' }}>{group.dateCategory}</h4>
                    {renderDateGroups(group.dateGroups)}
                </div>
            )}
        </div>
    ));

    return (
        <div className="version-history-container">
            <div style={{ padding: '16px 20px 0 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0 }}>{treeName ? `${treeName}: ` : ''}{filterNodeId && nodes[filterNodeId] ? `History of ${nodes[filterNodeId].name}` : "Version History"}</h2>
                    <CloseButton onClick={onClose} />
                </div>
                <div className="vh-tabs">
                    <button className={`vh-tab ${viewMode === 'date' ? 'active' : ''}`} onClick={() => setViewMode('date')}>By Date</button>
                    <button className={`vh-tab ${viewMode === 'author' ? 'active' : ''}`} onClick={() => setViewMode('author')}>By Author</button>
                </div>
            </div>
            <div className="version-table-wrapper" style={{ height: 'calc(100% - 110px)' }}>
                {summary.length === 0 ? <div className="empty-state">No history available.</div> : (
                    <div className="history-list">
                        {viewMode === 'date' ? renderHistoryList(groupedLogs) : (
                            <div className="author-list">
                                {groupedByAuthor.map(authorBlock => {
                                    const isExp = expandedSections.has(`author-${authorBlock.authorEmail}`);
                                    return (
                                        <div key={authorBlock.author} className="author-block" style={{ marginBottom: '16px' }}>
                                            <div className="author-block-header" onClick={() => toggleSection(`author-${authorBlock.authorEmail}`)} style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                <span className={`arrow ${isExp ? 'expanded' : ''}`}>▶</span>
                                                <span style={{ marginLeft: '12px' }}>{authorBlock.displayName}</span>
                                                <span style={{ fontWeight: 'normal', fontSize: '0.9em', color: '#666', marginLeft: '8px' }}>({authorBlock.authorEmail})</span>
                                            </div>
                                            {isExp && <div style={{ paddingLeft: '8px', paddingTop: '8px' }}>{renderHistoryList(authorBlock.timeGrouped)}</div>}
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
