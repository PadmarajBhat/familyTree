import { useState, useEffect, useCallback } from 'react';

export interface AppNavigationState {
    showSearch: boolean;
    setShowSearch: (show: boolean) => void;
    showCollaborators: boolean;
    setShowCollaborators: (show: boolean) => void;
    showFindRelation: boolean;
    setShowFindRelation: (show: boolean) => void;
    showVersionHistory: boolean;
    setShowVersionHistory: (show: boolean) => void;
    showDashboard: boolean;
    setShowDashboard: (show: boolean) => void;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    editorMode: 'add' | 'edit' | null;
    setEditorMode: (mode: 'add' | 'edit' | null) => void;
    editingNodeId: string | null;
    setEditingNodeId: (id: string | null) => void;
    findRelationIds: { p1: string | null; p2: string | null };
    setFindRelationIds: (ids: { p1: string | null; p2: string | null }) => void;
    historyFilterNodeId: string | null;
    setHistoryFilterNodeId: (id: string | null) => void;
    isAnyModalOpen: boolean;
    closeAllModals: () => void;
    handleManualClose: () => void;
}

export const useAppNavigation = (): AppNavigationState => {
    const [showSearch, setShowSearch] = useState(false);
    const [showCollaborators, setShowCollaborators] = useState(false);
    const [showFindRelation, setShowFindRelation] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [findRelationIds, setFindRelationIds] = useState<{ p1: string | null; p2: string | null }>({ p1: null, p2: null });
    const [historyFilterNodeId, setHistoryFilterNodeId] = useState<string | null>(null);

    const isAnyModalOpen = showSearch || showCollaborators || showFindRelation || showVersionHistory || showDashboard || !!selectedNodeId || !!editorMode;

    const closeAllModals = useCallback(() => {
        setShowSearch(false);
        setShowCollaborators(false);
        setShowFindRelation(false);
        setShowVersionHistory(false);
        setShowDashboard(false);
        setSelectedNodeId(null);
        setEditorMode(null);
        setEditingNodeId(null);
        setFindRelationIds({ p1: null, p2: null });
        setHistoryFilterNodeId(null);
    }, []);

    useEffect(() => {
        if (isAnyModalOpen) {
            if (window.history.state?.modal !== true) {
                window.history.pushState({ modal: true }, '');
            }
        }
    }, [isAnyModalOpen]);

    useEffect(() => {
        const handlePopState = () => {
            if (isAnyModalOpen) {
                closeAllModals();
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isAnyModalOpen, closeAllModals]);

    const handleManualClose = useCallback(() => {
        closeAllModals();
        if (window.history.state?.modal) {
            window.history.back();
        }
    }, [closeAllModals]);

    return {
        showSearch, setShowSearch,
        showCollaborators, setShowCollaborators,
        showFindRelation, setShowFindRelation,
        showVersionHistory, setShowVersionHistory,
        showDashboard, setShowDashboard,
        selectedNodeId, setSelectedNodeId,
        editorMode, setEditorMode,
        editingNodeId, setEditingNodeId,
        findRelationIds, setFindRelationIds,
        historyFilterNodeId, setHistoryFilterNodeId,
        isAnyModalOpen,
        closeAllModals,
        handleManualClose
    };
};
