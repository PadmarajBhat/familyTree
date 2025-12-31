
import { useMemo, useState, useEffect } from 'react';
import type { ChangeLog, PersonNode } from '../../../logic/types';

export interface GroupedLog {
    dateCategory: string;
    dateGroups: {
        date: string;
        authorGroups: {
            author: string;
            authorEmail: string;
            logs: ChangeLog[];
        }[];
        timestamp: number;
    }[];
}

export function useVersionHistory(summary: ChangeLog[], nodes: Record<string, PersonNode>, filterNodeId?: string | null) {
    const [viewMode, setViewMode] = useState<'date' | 'author'>('date');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['date-Today']));

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filteredSummary = useMemo(() => {
        if (!filterNodeId) return summary;
        const targetName = nodes[filterNodeId]?.name?.toLowerCase();
        return summary.filter(log => {
            if (log.structured?.length) return log.structured.some(c => c.nodeId === filterNodeId);
            return targetName ? log.changes.toLowerCase().includes(targetName) : false;
        });
    }, [summary, filterNodeId, nodes]);

    useEffect(() => {
        if (filterNodeId) setExpandedSections(new Set(['date-Today', 'date-This Week', 'date-Older', 'date-This Month']));
    }, [filterNodeId]);

    const groupLogsByDate = (logs: ChangeLog[]): GroupedLog[] => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const oneWeek = new Date(today); oneWeek.setDate(today.getDate() - 7);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const groups: Record<string, ChangeLog[]> = { 'Today': [], 'This Week': [], 'This Month': [], 'Older': [] };
        logs.forEach(log => {
            const d = new Date(log.editedTime);
            const dOnly = new Date(d); dOnly.setHours(0, 0, 0, 0);
            if (dOnly.getTime() === today.getTime()) groups['Today'].push(log);
            else if (d >= oneWeek) groups['This Week'].push(log);
            else if (d >= startOfMonth) groups['This Month'].push(log);
            else groups['Older'].push(log);
        });

        return ['Today', 'This Week', 'This Month', 'Older'].filter(cat => groups[cat].length > 0).map(cat => {
            const dateMap: Record<string, ChangeLog[]> = {};
            groups[cat].forEach(log => {
                const ds = new Date(log.editedTime).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                if (!dateMap[ds]) dateMap[ds] = [];
                dateMap[ds].push(log);
            });
            const dateGroups = Object.entries(dateMap).map(([date, dLogs]) => {
                const authorMap: Record<string, ChangeLog[]> = {};
                dLogs.forEach(log => {
                    const a = log.editedBy || 'Unknown';
                    if (!authorMap[a]) authorMap[a] = [];
                    authorMap[a].push(log);
                });
                return { date, authorGroups: Object.entries(authorMap).map(([author, aLogs]) => ({ author, authorEmail: author, logs: aLogs })), timestamp: new Date(dLogs[0].editedTime).getTime() };
            }).sort((a, b) => b.timestamp - a.timestamp);
            return { dateCategory: cat, dateGroups };
        });
    };

    const groupedLogs = useMemo(() => groupLogsByDate(filteredSummary), [filteredSummary]);

    const groupedByAuthor = useMemo(() => {
        const authorMap: Record<string, ChangeLog[]> = {};
        filteredSummary.forEach(log => {
            const a = log.editedBy || 'Unknown';
            if (!authorMap[a]) authorMap[a] = [];
            authorMap[a].push(log);
        });
        return Object.entries(authorMap).map(([author, aLogs]) => {
            const authorNode = Object.values(nodes).find(n => n.email?.toLowerCase() === author.toLowerCase());
            return { author, authorEmail: author, displayName: authorNode ? authorNode.name : author, timeGrouped: groupLogsByDate(aLogs) };
        }).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    }, [filteredSummary, nodes]);

    return { viewMode, setViewMode, expandedSections, toggleSection, groupedLogs, groupedByAuthor };
}
