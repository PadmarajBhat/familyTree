
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
    setFindRelationIds, setHistoryFilterNodeId, setShowFindRelation, setShowVersionHistory
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

  if (staticPage === 'privacy') return <Suspense fallback={<div>Loading...</div>}><PrivacyPolicy onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;
  if (staticPage === 'terms') return <Suspense fallback={<div>Loading...</div>}><TermsOfService onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;

  return (
    <>
      <AppHeader treeName={tree?.treeName} isSignedIn={isSignedIn} currentUser={currentUser} setIsSignedIn={setIsSignedIn} />
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
      />
    </>
  );
}

export default App;
