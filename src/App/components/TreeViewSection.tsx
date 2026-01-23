import React from 'react';
import { useTranslation } from 'react-i18next';
import { TreeView } from '../../components/TreeView';
import { PersonDetail } from '../../components/PersonDetail';
import { MemberEditor } from '../../components/MemberEditor';
import { MemberSearch } from '../../components/MemberSearch';
import { CollaboratorList } from '../../components/CollaboratorList';
import { FindRelation } from '../../components/FindRelation';
import { VersionHistory } from '../../components/VersionHistory';
import { FanChartView } from '../../components/FanChartView';
import { Dashboard } from '../../components/Dashboard';
import type { TreeDocument, PersonNode } from '../../logic/types';

interface TreeViewSectionProps {
    tree: TreeDocument;
    currentUser: { email: string; name: string } | null;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    editorMode: 'add' | 'edit' | null;
    setEditorMode: (mode: 'add' | 'edit' | null) => void;
    editingNodeId: string | null;
    setEditingNodeId: (id: string | null) => void;
    searchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    collaboratorsOpen: boolean;
    setCollaboratorsOpen: (open: boolean) => void;
    findRelationOpen: boolean;
    setFindRelationOpen: (open: boolean) => void;
    versionHistoryOpen: boolean;
    setVersionHistoryOpen: (open: boolean) => void;
    viewMode: 'tree' | 'fanchart';
    setViewMode: (mode: 'tree' | 'fanchart') => void;
    dashboardOpen: boolean;
    setDashboardOpen: (open: boolean) => void;
    onSaveMember: (data: PersonNode, p: string | null, c: string[], s: string[], sib: string[], shadow: PersonNode[], mode: 'add' | 'edit' | null) => void;
    onDeleteMember: (id: string) => void;
    onToggleEditor: (id: string, s: boolean, u?: { email?: string; phone?: string }) => void;
    onSignOut: () => void;
    onSwitchTree: () => void;
}

export const TreeViewSection: React.FC<TreeViewSectionProps> = ({
    tree, currentUser, selectedNodeId, setSelectedNodeId,
    editorMode, setEditorMode, editingNodeId, setEditingNodeId,
    searchOpen, setSearchOpen, collaboratorsOpen, setCollaboratorsOpen,
    findRelationOpen, setFindRelationOpen, versionHistoryOpen, setVersionHistoryOpen,
    viewMode, setViewMode, dashboardOpen, setDashboardOpen, onSaveMember, onDeleteMember, onToggleEditor, onSignOut, onSwitchTree
}) => {
    const { t } = useTranslation();

    // Find current user's node ID
    const currentUserNodeId = React.useMemo(() => {
        if (!currentUser || !tree || !tree.nodes) return null;
        const userNode = Object.values(tree.nodes).find(n => n.email === currentUser.email);
        return userNode ? userNode.nodeId : null;
    }, [currentUser, tree]);

    // State for filtering Version History
    const [historyFilterId, setHistoryFilterId] = React.useState<string | null>(null);

    return (
        <div className="tree-container">
            {/* View Mode Toggle */}
            <div className="view-toggle-container" style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                background: 'white',
                padding: '4px',
                borderRadius: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'flex',
                gap: '8px'
            }}>
                <button
                    onClick={() => setViewMode('tree')}
                    style={{
                        padding: '6px 16px',
                        borderRadius: '16px',
                        border: 'none',
                        background: viewMode === 'tree' ? '#4a90e2' : 'transparent',
                        color: viewMode === 'tree' ? 'white' : '#666',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Tree
                </button>
                <button
                    onClick={() => setViewMode('fanchart')}
                    style={{
                        padding: '6px 16px',
                        borderRadius: '16px',
                        border: 'none',
                        background: viewMode === 'fanchart' ? '#4a90e2' : 'transparent',
                        color: viewMode === 'fanchart' ? 'white' : '#666',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Fan Chart
                </button>
            </div>

            {viewMode === 'tree' ? (
                <TreeView
                    data={tree}
                    onNodeClick={setSelectedNodeId}
                    onNodeLongPress={setSelectedNodeId}
                    showControls={true}
                />
            ) : (
                <FanChartView
                    data={tree}
                    rootNodeId={selectedNodeId || tree.rootNodeId}
                    onNodeClick={setSelectedNodeId}
                    onResetRoot={() => setSelectedNodeId(null)}
                />
            )}

            <div className="floating-controls">
                <button className="btn-fab primary" onClick={() => { setEditingNodeId(null); setEditorMode('add'); }} title="Add Member" style={{ backgroundColor: '#2196f3', color: 'white' }}>➕</button>
                <button className="btn-fab" onClick={() => setSearchOpen(true)} title={t('menu.search')}>🔍</button>
                <button className="btn-fab" onClick={() => setCollaboratorsOpen(true)} title={t('menu.collaborators')}>👥</button>
                <button className="btn-fab" onClick={() => setFindRelationOpen(true)} title={t('menu.findRelation')}>🔗</button>
                {/* FanChart button removed from here, moved to top toggle */}
                <button className="btn-fab" onClick={() => setDashboardOpen(true)} title="Dashboard">📊</button>
                <button className="btn-fab" onClick={() => { setHistoryFilterId(null); setVersionHistoryOpen(true); }} title={t('menu.history')}>🕒</button>
                <button className="btn-fab" onClick={onSwitchTree} title={t('menu.switchTree') || "Switch Tree"}>🌳</button>
                <button className="btn-fab logout" onClick={onSignOut} title={t('menu.signOut')}>🚪</button>
            </div>

            {selectedNodeId && tree.nodes[selectedNodeId] && (
                <PersonDetail
                    node={tree.nodes[selectedNodeId]}
                    tree={tree}
                    currentUser={currentUser}
                    onClose={() => setSelectedNodeId(null)}
                    onEdit={() => setEditorMode('edit')}
                    onDelete={() => onDeleteMember(selectedNodeId)}
                    onNodeClick={setSelectedNodeId}
                    onFindRelation={(id) => { setSelectedNodeId(id); setFindRelationOpen(true); }}
                    onViewHistory={(id) => { setSelectedNodeId(id); setHistoryFilterId(id); setVersionHistoryOpen(true); }}
                />
            )}

            {editorMode && (
                <MemberEditor
                    currentUserEmail={currentUser?.email || ''}
                    mode={editorMode}
                    initialData={editorMode === 'edit' && selectedNodeId ? tree.nodes[selectedNodeId] : (editingNodeId ? { parentId: editingNodeId } as any : undefined)}
                    existingNodes={tree.nodes}
                    onCancel={() => {
                        setEditorMode(null);
                        setEditingNodeId(null);
                    }}
                    onSave={(data, p, c, s, sib, shadow) => onSaveMember(data, p, c, s, sib, shadow || [], editorMode)}
                />
            )}

            {searchOpen && (
                <MemberSearch
                    nodes={tree.nodes}
                    onMemberClick={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        setSearchOpen(false);
                    }}
                    onClose={() => setSearchOpen(false)}
                />
            )}

            {collaboratorsOpen && (
                <CollaboratorList
                    nodes={tree.nodes}
                    currentUserEmail={currentUser?.email || ''}
                    canToggle={true}
                    onToggleEditor={onToggleEditor}
                    onClose={() => setCollaboratorsOpen(false)}
                />
            )}

            {findRelationOpen && (
                <FindRelation
                    nodes={tree.nodes}
                    initialPerson1Id={currentUserNodeId} // Myself
                    initialPerson2Id={selectedNodeId}   // The person we are viewing
                    onClose={() => setFindRelationOpen(false)}
                    onMemberClick={(nodeId: string) => {
                        setSelectedNodeId(nodeId);
                        setFindRelationOpen(false);
                    }}
                />
            )}

            {versionHistoryOpen && (
                <VersionHistory
                    summary={tree.summary}
                    nodes={tree.nodes}
                    onClose={() => setVersionHistoryOpen(false)}
                    onSelectNode={setSelectedNodeId}
                    treeName={tree.treeName}
                    treeId={tree.treeId}
                    filterNodeId={historyFilterId}
                />
            )}

            {/* FanChart Modal Removed - now inline */}

            {dashboardOpen && (
                <div className="modal-overlay">
                    <div className="modal-content full-screen" style={{ padding: 0, background: '#f5f7fa' }}>
                        <Dashboard
                            tree={tree}
                            onClose={() => setDashboardOpen(false)}
                            onNodeClick={(id) => {
                                setSelectedNodeId(id);
                                setDashboardOpen(false);
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
