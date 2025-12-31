
import { useState, Suspense, lazy } from 'react';

// Hooks
import { useAppNavigation } from './hooks/useAppNavigation';
import { useAppTree } from './hooks/useAppTree';
import { useLocking } from './hooks/useLocking';
import { useTreeSaving } from './hooks/useTreeSaving';
import { useMemberSaving } from './hooks/useMemberSaving';
import { useMemberDeletion } from './hooks/useMemberDeletion';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useSyncGlobalTree } from './hooks/useSyncGlobalTree';
import { useGeminiAdapters } from './hooks/useGeminiAdapters';

// Components
import { AppHeader } from './components/AppHeader';
import { AppContent } from './components/AppContent';

const PrivacyPolicy = lazy(() => import('../components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('../components/TermsOfService'));

import { canEditNode } from '../logic/permissions';
import { canEdit } from '../logic/accessControl';
import { grantWritePermission, grantLockFilePermission, updateUserPreference } from '../services/drive';
import './App.css';

function App() {
  // --- State ---
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [isGapiReady, setIsGapiReady] = useState(false);
  const [treeViewType] = useState<'standard' | 'hourglass'>('standard');
  const [fanRootId, setFanRootId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'home' | 'tree'>('home');
  const [staticPage, setStaticPage] = useState<'privacy' | 'terms' | null>(null);

  // --- Hooks ---
  const {
    tree, setTree, loading, setLoading, loadingMessage, setLoadingMessage,
    isSheetsMode, error, accessDenied, currentTreeId, setCurrentTreeId, currentTreeName,
    homeAutoloadEnabled, loadTree
  } = useAppTree(currentUser, isSignedIn);

  const {
    selectedNodeId, setSelectedNodeId, editorMode, setEditorMode, editingNodeId, setEditingNodeId,
    setFindRelationIds, setHistoryFilterNodeId, setShowFindRelation, setShowVersionHistory,
    showSearch, setShowSearch, showFindRelation, showCollaborators, setShowCollaborators,
    showVersionHistory, showDashboard, setShowDashboard, findRelationIds, historyFilterNodeId
  } = useAppNavigation();

  useAppInitialization({ setIsSignedIn, setCurrentUser, setIsGapiReady, setStaticPage, isSignedIn, isGapiReady, setTree });

  const { executeWithLock } = useLocking({ setLoading, setLoadingMessage, loadTree, currentTreeName, currentTreeId, setIsSignedIn, setTree });
  const { saveWithMerge } = useTreeSaving({ isSheetsMode, setLoading, setLoadingMessage, setTree, currentTreeName, currentTreeId, setCurrentTreeId });
  const { handleSaveMember } = useMemberSaving({ tree, currentUser, editorMode, setEditorMode, setEditingNodeId, setTree, setLoading, executeWithLock, saveWithMerge });
  const { handleDeleteMember } = useMemberDeletion({ tree, currentUser, setTree, setSelectedNodeId, setLoading, executeWithLock, saveWithMerge });

  useSyncGlobalTree({ currentUser, isGapiReady, isSignedIn, homeAutoloadEnabled, setLoading, setLoadingMessage, loadTree, setViewState });

  const geminiAdapters = useGeminiAdapters({ tree, handleSaveMember });

  // --- Handlers ---
  const handleNodeClick = (nodeId: string) => {
    if (treeViewType === 'hourglass') {
      if (nodeId === (fanRootId || tree?.rootNodeId)) setSelectedNodeId(nodeId);
      else setFanRootId(nodeId);
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const handleResetRoot = () => setFanRootId(null);
  const handleFindRelation = (targetNodeId: string) => {
    if (selectedNodeId && targetNodeId) {
      setFindRelationIds({ p1: selectedNodeId, p2: targetNodeId });
      setShowFindRelation(true);
      setSelectedNodeId(null);
    }
  };
  const handleViewHistory = (nodeId: string) => {
    setHistoryFilterNodeId(nodeId);
    setShowVersionHistory(true);
    setSelectedNodeId(null);
  };

  const handleSetDefault = async () => {
    if (currentUser?.email && currentTreeName) {
      try {
        await updateUserPreference(currentUser.email, currentTreeName);
        alert(`${currentTreeName} set as default tree.`);
      } catch (e) {
        console.error("Failed to set default tree", e);
        alert("Failed to set default tree.");
      }
    }
  };

  const onToggleEditor = async (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => {
    if (!tree) return;
    await executeWithLock(async (latestTree) => {
      if (!latestTree) return;
      const node = latestTree.nodes[nodeId];
      if (!node) return;

      const updatedNode = {
        ...node,
        isEditor: newStatus,
        editorSince: newStatus ? new Date().toISOString() : null,
        ...updates
      };

      if (newStatus && updatedNode.email && currentTreeId) {
        await grantWritePermission(currentTreeId, updatedNode.email);
        await grantLockFilePermission(currentTreeId, updatedNode.email);
      }

      const newNodes = { ...latestTree.nodes, [nodeId]: updatedNode };
      const updatedTree = { ...latestTree, nodes: newNodes };
      await saveWithMerge(updatedTree, `Toggle editor status for ${updatedNode.name}`);
    });
  };

  if (staticPage === 'privacy') return <Suspense fallback={<div>Loading...</div>}><PrivacyPolicy onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;
  if (staticPage === 'terms') return <Suspense fallback={<div>Loading...</div>}><TermsOfService onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;

  return (
    <div className="app-container">
      {isSignedIn && (
        <AppHeader
          treeName={tree?.treeName}
          isSignedIn={isSignedIn}
          currentUser={currentUser}
          setIsSignedIn={setIsSignedIn}
          onShowSearch={() => setShowSearch(true)}
          onShowFindRelation={() => setShowFindRelation(true)}
          onShowCollaborators={() => setShowCollaborators(true)}
          onShowHistory={() => { setHistoryFilterNodeId(null); setShowVersionHistory(true); }}
          onShowDashboard={() => setShowDashboard(true)}
          onSetDefault={handleSetDefault}
          onSetViewState={setViewState}
        />
      )}
      <AppContent
        loading={loading} loadingMessage={loadingMessage} error={error} accessDenied={accessDenied}
        isSignedIn={isSignedIn} viewState={viewState} currentUser={currentUser} tree={tree}
        treeViewType={treeViewType} fanRootId={fanRootId} selectedNodeId={selectedNodeId}
        editorMode={editorMode} editingNodeId={editingNodeId} homeAutoloadEnabled={homeAutoloadEnabled}
        currentTreeId={currentTreeId} isAuthorized={!!(currentUser && canEdit(currentUser.email))}
        loadTree={loadTree} setViewState={setViewState} handleNodeClick={handleNodeClick}
        handleResetRoot={handleResetRoot} setSelectedNodeId={setSelectedNodeId}
        handleEditClick={() => {
          if (selectedNodeId && tree) {
            if (!canEditNode(tree, currentUser?.email, selectedNodeId)) {
              alert("You do not have permission to edit this member.");
              return;
            }
            setEditingNodeId(selectedNodeId);
            setEditorMode('edit');
          }
        }}
        handleDeleteMember={handleDeleteMember} handleFindRelation={handleFindRelation}
        handleViewHistory={handleViewHistory} handleSaveMember={handleSaveMember}
        setEditorMode={setEditorMode} setEditingNodeId={setEditingNodeId} geminiAdapters={geminiAdapters}
        showSearch={showSearch} setShowSearch={setShowSearch}
        showFindRelation={showFindRelation} setShowFindRelation={setShowFindRelation}
        showCollaborators={showCollaborators} setShowCollaborators={setShowCollaborators}
        showVersionHistory={showVersionHistory} setShowVersionHistory={setShowVersionHistory}
        showDashboard={showDashboard} setShowDashboard={setShowDashboard}
        findRelationIds={findRelationIds} historyFilterNodeId={historyFilterNodeId}
        onToggleEditor={onToggleEditor}
        onShowPrivacy={() => setStaticPage('privacy')}
        onShowTerms={() => setStaticPage('terms')}
      />
    </div>
  );
}

export default App;
