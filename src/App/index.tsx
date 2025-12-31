
import { useEffect, useState, Suspense, lazy } from 'react';
import { initGoogleClient, signIn, signOut, getUserProfile, setAuthErrorCallback, updateUserStarredTrees } from '../services/drive';
import { useTranslation } from 'react-i18next';
import { GlobalTreeService } from '../services/GlobalTreeService';
import type { PersonNode } from '../logic/types';
import { v4 as uuidv4 } from 'uuid';

// Hooks
import { useAppNavigation } from './hooks/useAppNavigation';
import { useAppTree } from './hooks/useAppTree';
import { useLocking } from './hooks/useLocking';
import { useTreeSaving } from './hooks/useTreeSaving';
import { useMemberSaving } from './hooks/useMemberSaving';
import { useMemberDeletion } from './hooks/useMemberDeletion';

// Lazy Load Components
const TreeView = lazy(() => import('../components/TreeView').then(module => ({ default: module.TreeView })));
const PersonDetail = lazy(() => import('../components/PersonDetail').then(module => ({ default: module.PersonDetail })));
const MemberEditor = lazy(() => import('../components/MemberEditor').then(module => ({ default: module.MemberEditor })));
const FanChartView = lazy(() => import('../components/FanChartView').then(module => ({ default: module.FanChartView })));
const Home = lazy(() => import('../components/Home').then(module => ({ default: module.Home })));
const PrivacyPolicy = lazy(() => import('../components/PrivacyPolicy')); // Default export
const TermsOfService = lazy(() => import('../components/TermsOfService')); // Default export
const GeminiLive = lazy(() => import('../components/GeminiLive').then(module => ({ default: module.GeminiLive })));

import { LoadingOverlay } from '../components/LoadingOverlay';
import { canEdit } from '../logic/accessControl';
import { canEditNode } from '../logic/permissions';

import './App.css';

function App() {
  const { t } = useTranslation();

  // --- Auth State ---
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [isGapiReady, setIsGapiReady] = useState(false);

  // --- Custom Hooks ---
  const {
    tree, setTree, loading, setLoading, loadingMessage, setLoadingMessage,
    isSheetsMode, error, accessDenied, currentTreeId, setCurrentTreeId, currentTreeName,
    homeAutoloadEnabled, loadTree
  } = useAppTree(currentUser, isSignedIn);

  const {
    selectedNodeId, setSelectedNodeId,
    editorMode, setEditorMode,
    editingNodeId, setEditingNodeId,
    setFindRelationIds,
    setHistoryFilterNodeId,
    setShowFindRelation,
    setShowVersionHistory
  } = useAppNavigation();

  const [treeViewType] = useState<'standard' | 'hourglass'>('standard');
  const [fanRootId, setFanRootId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'home' | 'tree'>('home');
  const [staticPage, setStaticPage] = useState<'privacy' | 'terms' | null>(null);

  const { executeWithLock } = useLocking({
    setLoading, setLoadingMessage, loadTree, currentTreeName, currentTreeId, setIsSignedIn, setTree
  });

  const { saveWithMerge } = useTreeSaving({
    isSheetsMode, setLoading, setLoadingMessage, setTree, currentTreeName, currentTreeId, setCurrentTreeId
  });

  const { handleSaveMember } = useMemberSaving({
    tree, currentUser, editorMode, setEditorMode, setEditingNodeId, setTree, setLoading, executeWithLock, saveWithMerge
  });

  const { handleDeleteMember } = useMemberDeletion({
    tree, currentUser, setTree, setSelectedNodeId, setLoading, executeWithLock, saveWithMerge
  });

  // --- Auth Effects ---
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#privacy-policy') {
      setStaticPage('privacy');
    } else if (hash === '#terms-of-service') {
      setStaticPage('terms');
    }

    setAuthErrorCallback((err) => {
      console.warn("Auth Error caught in App:", err);
      if (err === 'interaction_required' || err === 'access_denied') {
        window.location.href = window.location.origin;
      }
    });

    initGoogleClient((signedIn) => {
      setIsSignedIn(signedIn);
    }).then(() => {
      setIsGapiReady(true);
    });
  }, []);

  useEffect(() => {
    if (isSignedIn && isGapiReady) {
      getUserProfile().then(profile => {
        if (profile) {
          setCurrentUser({ email: profile.email, name: profile.name });
        }
      });
    } else if (!isSignedIn) {
      setCurrentUser(null);
      setTree(null);
    }
  }, [isSignedIn, isGapiReady, setTree]);

  // --- Prefetching ---
  useEffect(() => {
    if (tree && !loading) {
      const prefetchTimer = setTimeout(() => {
        console.log("Prefetching secondary components...");
        const prefetch = (importFn: () => Promise<unknown>) => {
          importFn().catch(err => console.debug("Prefetch failed ignored", err));
        };
        prefetch(() => import('../components/Dashboard'));
        prefetch(() => import('../components/GeminiLive'));
        prefetch(() => import('../components/MemberEditor'));
        prefetch(() => import('../components/IdentifyKin'));
        prefetch(() => import('../components/PersonDetail'));
      }, 5000);

      return () => clearTimeout(prefetchTimer);
    }
  }, [tree, loading]);

  // Sync GlobalTreeService
  useEffect(() => {
    if (currentUser?.email && isGapiReady && isSignedIn) {
      const shortlistKey = `shortlist_${currentUser.email} `;
      const storedShortlist = localStorage.getItem(shortlistKey);
      if (storedShortlist) {
        try {
          const shortlist = JSON.parse(storedShortlist);
          if (Array.isArray(shortlist) && shortlist.length > 0) {
            console.log("Pre-loading shortlisted trees for Unified Search...");
            GlobalTreeService.loadShortlistedTrees(shortlist);
          }
        } catch (e) {
          console.error("Failed to parse shortlist for GlobalTreeService", e);
        }
      }
    }
  }, [currentUser, isGapiReady, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !isGapiReady || !currentUser || !homeAutoloadEnabled) return;

    const checkAccessAndLoad = async () => {
      setLoading(true);
      setLoadingMessage("Checking access...");
      try {
        setLoadingMessage("Scanning trees for your profile...");
        const result = await GlobalTreeService.findUserInTrees(currentUser.email);

        if (result) {
          console.log("User found in tree:", result.treeName);
          updateUserStarredTrees(currentUser.email, [result.treeName]).catch(console.error);
          await loadTree(false, result.treeId);
          setViewState('tree');
        } else {
          console.warn("User not found in any tree:", currentUser.email);
          setLoading(false);
          setViewState('home');
        }
      } catch (e) {
        console.error("Error in checkAccessAndLoad", e);
        setLoading(false);
      }
    };

    checkAccessAndLoad();
  }, [isSignedIn, isGapiReady, currentUser, homeAutoloadEnabled, loadTree, setLoading, setLoadingMessage]);


  const handleNodeClick = (nodeId: string) => {
    if (treeViewType === 'hourglass') {
      if (nodeId === (fanRootId || tree?.rootNodeId)) {
        setSelectedNodeId(nodeId);
      } else {
        setFanRootId(nodeId);
      }
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const handleEditClick = () => {
    if (selectedNodeId && tree) {
      if (!canEditNode(tree, currentUser?.email, selectedNodeId)) {
        alert("You do not have permission to edit this member.");
        return;
      }
      setEditingNodeId(selectedNodeId);
      setEditorMode('edit');
    }
  };



  // Gemini Live Adapters
  const handleGeminiAddPerson = async (data: Partial<PersonNode>) => {
    try {
      if (!data.name) throw new Error("Name is required");
      const newNode: PersonNode = {
        nodeId: data.nodeId || uuidv4(),
        name: data.name,
        gender: data.gender || 'unknown',
        dob: data.dob,
        dod: data.dod,
        spouseIds: [],
        childrenIds: [],
        parentId: data.parentId || null,
        ...data
      } as PersonNode;

      await handleSaveMember(newNode, newNode.parentId, [], [], []);
      return { success: true, message: `Added ${newNode.name}`, nodeId: newNode.nodeId };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  };

  const handleGeminiUpdatePerson = async (data: Partial<PersonNode>) => {
    try {
      if (!data.nodeId || !tree?.nodes[data.nodeId]) throw new Error("Node not found");
      const existing = tree.nodes[data.nodeId];
      const updated = { ...existing, ...data };
      await handleSaveMember(updated, updated.parentId, [], [], []);
      return { success: true, message: `Updated ${updated.name}`, nodeId: updated.nodeId };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  };

  const handleSearchNodes = async (query: string) => {
    if (!tree) return [];
    const lower = query.toLowerCase();
    return Object.values(tree.nodes).filter(n => n.name && n.name.toLowerCase().includes(lower));
  };

  const handleGetRecentNodes = async (limit: number) => {
    if (!tree) return [];
    return Object.values(tree.nodes)
      .sort((a, b) => new Date(b.editedTime || 0).getTime() - new Date(a.editedTime || 0).getTime())
      .slice(0, limit);
  };

  const handleResetRoot = () => {
    setFanRootId(null);
  };

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

  const isAuthorized = currentUser && canEdit(currentUser.email);

  if (staticPage === 'privacy') {
    return <Suspense fallback={<div>Loading...</div>}><PrivacyPolicy onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;
  }
  if (staticPage === 'terms') {
    return <Suspense fallback={<div>Loading...</div>}><TermsOfService onClose={() => { setStaticPage(null); window.history.back(); }} /></Suspense>;
  }

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <h1>{t('app.title')}</h1>
          {tree && <span className="tree-name">{tree.treeName}</span>}
        </div>
        <div className="header-right">
          {/* View Switcher could go here */}
          {isSignedIn ? (
            <div className="user-info">
              <span>{currentUser?.name}</span>
              <button onClick={() => { signOut(); setIsSignedIn(false); }}>{t('auth.signOut')}</button>
            </div>
          ) : (
            <button onClick={() => signIn()}>{t('auth.signIn')}</button>
          )}
        </div>
      </header>

      <main className="app-main">
        {loading && <LoadingOverlay message={loadingMessage} />}
        {error ? (
          <div className="error-screen">{error}</div>
        ) : accessDenied ? (
          <div className="access-denied">Access Denied</div>
        ) : !isSignedIn ? (
          <Suspense fallback={<div>Loading Home...</div>}>
            <Home
              userEmail={currentUser?.email || ''}
              onSelectTree={async (fileId) => {
                await loadTree(false, fileId);
                setViewState('tree');
              }}
              currentTreeId={currentTreeId}
              isEditor={false}
              enableAutoload={homeAutoloadEnabled}
            />
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
          </>
        )}
      </main>

      {isSignedIn && tree && (
        <Suspense fallback={null}>
          <GeminiLive
            onAddPerson={handleGeminiAddPerson}
            onUpdatePerson={handleGeminiUpdatePerson}
            onSearchNodes={handleSearchNodes}
            onGetRecentNodes={handleGetRecentNodes}
          />
        </Suspense>
      )}
    </>
  );
}

export default App;
