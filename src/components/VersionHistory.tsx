import React from 'react';
import type { ChangeLog } from '../logic/types';
import { CloseButton } from './CloseButton';
import './VersionHistory.css';

interface VersionHistoryProps {
    summary: ChangeLog[];
    onClose: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ summary, onClose }) => {
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
                    <table className="version-table">
                        <thead>
                            <tr>
                                <th className="sr-col">Sr No</th>
                                <th className="root-col">Root Node Name</th>
                                <th className="summary-col">Summary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.map((log, idx) => (
                                <tr key={idx}>
                                    <td className="sr-cell">{summary.length - idx}</td>
                                    <td className="root-cell">{log.rootNodeName || '-'}</td>
                                    <td className="summary-cell">
                                        <div className="changes-text">{log.changes}</div>
                                        <div className="changes-meta">
                                            By {log.editedBy} on {new Date(log.editedTime).toLocaleString('en-IN', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                        {log.structured && log.structured.length > 0 && (
                                            <details className="changes-details">
                                                <summary>Details</summary>
                                                <pre>{JSON.stringify(log.structured, null, 2)}</pre>
                                            </details>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
