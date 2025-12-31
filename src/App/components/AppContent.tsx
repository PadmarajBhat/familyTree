
import React, { Suspense, lazy } from 'react';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import type { TreeDocument } from '../../logic/types';

const TreeView = lazy(() => import('../../components/TreeView').then(module => ({ default: module.TreeView })));
const PersonDetail = lazy(() => import('../../components/PersonDetail').then(module => ({ default: module.PersonDetail })));
const MemberEditor = lazy(() => import('../../components/MemberEditor').then(module => ({ default: module.MemberEditor })));
const FanChartView = lazy(() => import('../../components/FanChartView').then(module => ({ default: module.FanChartView })));
const Home = lazy(() => import('../../components/Home').then(module => ({ default: module.Home })));
const Landing = lazy(() => import('../../components/Landing').then(module => ({ default: module.Landing })));
const GeminiLive = lazy(() => import('../../components/GeminiLive').then(module => ({ default: module.GeminiLive })));
const MemberSearch = lazy(() => import('../../components/MemberSearch').then(module => ({ default: module.MemberSearch })));
const FindRelation = lazy(() => import('../../components/FindRelation').then(module => ({ default: module.FindRelation })));
const CollaboratorList = lazy(() => import('../../components/CollaboratorList').then(module => ({ default: module.CollaboratorList })));
const VersionHistory = lazy(() => import('../../components/VersionHistory').then(module => ({ default: module.VersionHistory })));
const Dashboard = lazy(() => import('../../components/Dashboard').then(module => ({ default: module.Dashboard })));

interface AppContentProps {
    loading: boolean;
    loadingMessage: string;
    error: string | null;
    accessDenied: boolean;
    isSignedIn: boolean;
    viewState: 'home' | 'tree';
    currentUser: { email: string; name: string } | null;
    tree: TreeDocument | null;
    treeViewType: 'standard' | 'hourglass';
    fanRootId: string | null;
    selectedNodeId: string | null;
    editorMode: 'add' | 'edit' | null;
    editingNodeId: string | null;
    homeAutoloadEnabled: boolean;
    currentTreeId: string | null;
    isAuthorized: boolean;
    loadTree: (returnOnly: boolean, fileId?: string) => Promise<any>;
    setViewState: (val: 'home' | 'tree') => void;
    handleNodeClick: (nodeId: string) => void;
    handleResetRoot: () => void;
    setSelectedNodeId: (id: string | null) => void;
    handleEditClick: () => void;
    handleDeleteMember: (nodeId: string) => void;
    handleFindRelation: (nodeId: string) => void;
    handleViewHistory: (nodeId: string) => void;
    handleSaveMember: any;
    setEditorMode: (mode: 'add' | 'edit' | null) => void;
    setEditingNodeId: (id: string | null) => void;
    geminiAdapters: any;
    showSearch: boolean;
    setShowSearch: (val: boolean) => void;
    showFindRelation: boolean;
    setShowFindRelation: (val: boolean) => void;
    showCollaborators: boolean;
    setShowCollaborators: (val: boolean) => void;
    showVersionHistory: boolean;
    setShowVersionHistory: (val: boolean) => void;
    showDashboard: boolean;
    setShowDashboard: (val: boolean) => void;
    findRelationIds: { p1: string | null; p2: string | null };
    historyFilterNodeId: string | null;
    onToggleEditor: (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => void;
}

export const AppContent: React.FC<AppContentProps> = ({
    loading, loadingMessage, error, accessDenied, isSignedIn, viewState, currentUser, tree,
    treeViewType, fanRootId, selectedNodeId, editorMode, editingNodeId, homeAutoloadEnabled,
    currentTreeId, isAuthorized, loadTree, setViewState, handleNodeClick, handleResetRoot,
    setSelectedNodeId, handleEditClick, handleDeleteMember, handleFindRelation, handleViewHistory,
    handleSaveMember, setEditorMode, setEditingNodeId, geminiAdapters,
    showSearch, setShowSearch, showFindRelation, setShowFindRelation,
    showCollaborators, setShowCollaborators, showVersionHistory, setShowVersionHistory,
    showDashboard, setShowDashboard, findRelationIds, historyFilterNodeId, onToggleEditor
}) => {
    if (error) return <div className="error-screen">{error}</div>;
    if (accessDenied) return <div className="access-denied">Access Denied</div>;

    return (
        <>
            <main className="app-main">
                {loading && <LoadingOverlay message={loadingMessage} />}

                {!isSignedIn ? (
                    <Suspense fallback={<div>Loading...</div>}>
                        <Landing />
                    </Suspense>
                ) : viewState === 'home' ? (
                    <Suspense fallback={<div>Loading Home...</div>}>
                        <Home
                            userEmail={currentUser?.email || ''}
                            onSelectTree={async (fileId) => {
                                await loadTree(false, fileId);
                                setViewState('tree');
                            }}
                            currentTreeId={currentTreeId}
                            isEditor={!!isAuthorized}
                            enableAutoload={homeAutoloadEnabled}
                        />
                    </Suspense>
                ) : (
                    <>
                        <Suspense fallback={<div>Loading Tree...</div>}>
                            {tree && (treeViewType === 'hourglass' ? (
                                <FanChartView
                                    data={tree}
                                    rootNodeId={fanRootId || tree.rootNodeId || ''}
                                    onNodeClick={handleNodeClick}
                                    onResetRoot={handleResetRoot}
                                />
                            ) : (
                                <TreeView
                                    data={tree}
                                    onNodeClick={handleNodeClick}
                                    onNodeLongPress={handleNodeClick}
                                />
                            ))}
                        </Suspense>

                        {selectedNodeId && tree && tree.nodes[selectedNodeId] && (
                            <Suspense fallback={null}>
                                <PersonDetail
                                    node={tree.nodes[selectedNodeId]}
                                    tree={tree}
                                    currentUser={currentUser}
                                    onClose={() => setSelectedNodeId(null)}
                                    onEdit={handleEditClick}
                                    onDelete={handleDeleteMember}
                                    onNodeClick={handleNodeClick}
                                    onFindRelation={handleFindRelation}
                                    onViewHistory={handleViewHistory}
                                />
                            </Suspense>
                        )}

                        {editorMode && (
                            <Suspense fallback={null}>
                                <MemberEditor
                                    currentUserEmail={currentUser?.email || ''}
                                    mode={editorMode}
                                    initialData={editingNodeId && tree ? tree.nodes[editingNodeId] : undefined}
                                    existingNodes={tree?.nodes || {}}
                                    onSave={handleSaveMember}
                                    onCancel={() => { setEditorMode(null); setEditingNodeId(null); }}
                                    onDelete={handleDeleteMember}
                                />
                            </Suspense>
                        )}

                        {showSearch && tree && (
                            <Suspense fallback={null}>
                                <MemberSearch
                                    nodes={tree.nodes}
                                    onMemberClick={handleNodeClick}
                                    onClose={() => setShowSearch(false)}
                                />
                            </Suspense>
                        )}

                        {showFindRelation && tree && (
                            <Suspense fallback={null}>
                                <FindRelation
                                    nodes={tree.nodes}
                                    onMemberClick={handleNodeClick}
                                    onClose={() => setShowFindRelation(false)}
                                    initialPerson1Id={findRelationIds.p1}
                                    initialPerson2Id={findRelationIds.p2}
                                />
                            </Suspense>
                        )}

                        {showCollaborators && tree && (
                            <Suspense fallback={null}>
                                <CollaboratorList
                                    nodes={tree.nodes}
                                    currentUserEmail={currentUser?.email || ''}
                                    canToggle={isAuthorized}
                                    onToggleEditor={onToggleEditor}
                                    onClose={() => setShowCollaborators(false)}
                                />
                            </Suspense>
                        )}

                        {showVersionHistory && tree && (
                            <Suspense fallback={null}>
                                <VersionHistory
                                    summary={tree.summary}
                                    nodes={tree.nodes}
                                    onClose={() => setShowVersionHistory(false)}
                                    onSelectNode={handleNodeClick}
                                    filterNodeId={historyFilterNodeId}
                                    treeName={tree.treeName}
                                />
                            </Suspense>
                        )}

                        {showDashboard && tree && (
                            <Suspense fallback={null}>
                                <Dashboard
                                    tree={tree}
                                    onClose={() => setShowDashboard(false)}
                                    onNodeClick={handleNodeClick}
                                />
                            </Suspense>
                        )}
                    </>
                )}
            </main>

            {isSignedIn && tree && (
                <Suspense fallback={null}>
                    <GeminiLive
                        {...geminiAdapters}
                    />
                </Suspense>
            )}
        </>
    );
};
