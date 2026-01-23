import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from '../components/Home';
import { LoadingOverlay } from '../components/LoadingOverlay';
import PrivacyPolicy from '../components/PrivacyPolicy';
import TermsOfService from '../components/TermsOfService';
import { GeminiLiveButton } from '../components/GeminiLive';
import { LanguageSelector } from '../components/LanguageSelector';

import { useAppInitialization } from './hooks/useAppInitialization';
import { useMemberActions } from './hooks/useMemberActions';
import { TreeViewSection } from './components/TreeViewSection';
import { LandingSection } from './components/LandingSection';
import './App.css';

function App() {
  const { t, i18n } = useTranslation();

  // View State for Modals
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [findRelationOpen, setFindRelationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'fanchart'>('tree');
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  // fanChartOpen removed in favor of viewMode
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [disableAutoload, setDisableAutoload] = useState(false);

  // Custom Hooks
  const init = useAppInitialization();
  const actions = useMemberActions({
    tree: init.tree,
    setTree: init.setTree,
    currentUser: init.currentUser,
    currentTreeId: init.currentTreeId,
    setCurrentTreeId: init.setCurrentTreeId,
    currentTreeName: init.currentTreeName,
    setLoading: init.setLoading,
    setLoadingMessage: init.setLoadingMessage,
    setEditorMode,
    setEditingNodeId,
    setSelectedNodeId,
    loadTree: init.loadTree
  });

  const handleSignIn = async () => {
    // Integration with Google Identity Services/Firebase will go here
    init.setIsSignedIn(true);
  };

  const handleSignOut = () => {
    init.setViewState('home');
    init.setIsSignedIn(false);
  };

  const isHome = init.viewState === 'home' || !init.isSignedIn;

  // Sync Language Preference
  // When init.language loads (from prefs), update i18n
  // doing this in a useEffect to avoid render loop
  // Note: init.language is initialized to 'en', but loaded async.
  // We might want to track if it's "loaded" vs "default". 
  // For now, we just sync if it differs from i18n.
  // actually, let's just do it when init.language changes.
  useEffect(() => {
    if (init.language && init.language !== i18n.language) {
      i18n.changeLanguage(init.language);
    }
  }, [init.language, i18n]);

  // Handle Back Button Navigation
  // We need to track which modal is open to close it on back press
  useEffect(() => {
    // Helper to check if any modal is open
    const isAnyModalOpen = () =>
      !!editorMode || !!editingNodeId || !!selectedNodeId || searchOpen || collaboratorsOpen || findRelationOpen || versionHistoryOpen || dashboardOpen || showPrivacy || showTerms;

    const handlePopState = () => {
      // Prioritize closing modals in logical order
      if (showPrivacy) { setShowPrivacy(false); return; }
      if (showTerms) { setShowTerms(false); return; }

      if (searchOpen) { setSearchOpen(false); return; }
      if (findRelationOpen) { setFindRelationOpen(false); return; }
      if (versionHistoryOpen) { setVersionHistoryOpen(false); return; }
      // fanChartOpen check removed
      if (dashboardOpen) { setDashboardOpen(false); return; }
      if (collaboratorsOpen) { setCollaboratorsOpen(false); return; }

      if (editingNodeId || editorMode) {
        setEditingNodeId(null);
        setEditorMode(null);
        return;
      }
      if (selectedNodeId) { setSelectedNodeId(null); return; }

      // If no modals, check view state
      if (init.viewState !== 'home') {
        init.setViewState('home');
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Push state when opening a modal if we haven't already
    // This is tricky because we don't want to push stack infinity.
    // Simplifying: we only rely on the fact that if we aren't at "root" state, back should close things.
    // But browser back only fires if there is history.
    // So we need to push state when entering deep states.

    // Strategy: 
    // - Home -> Tree: Push '#tree'
    // - Tree -> Modal: Push '#modal'

    // Check if we just entered a non-home state or opened a modal
    const anyModalOpen = isAnyModalOpen();
    const currentState = window.history.state;

    // If we opened a modal and current hash isn't already tagging it (simple debounce check)
    if (anyModalOpen && (!currentState || !currentState.modal)) {
      window.history.pushState({ modal: true }, '', '#modal');
    } else if (init.viewState !== 'home' && (!currentState || !currentState.page)) {
      // If we navigated to tree but no hash
      window.history.pushState({ page: 'tree' }, '', '#tree');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    init.viewState, init.setViewState,
    editorMode, editingNodeId, selectedNodeId,
    searchOpen, collaboratorsOpen, findRelationOpen,
    versionHistoryOpen, viewMode, dashboardOpen, showPrivacy, showTerms
  ]);

  return (
    <div className={`app-container ${isHome ? 'home-view' : 'tree-view-active'}`}>
      {init.loading && <LoadingOverlay message={init.loadingMessage} />}

      <header className="app-header">
        <div className="header-content">
          <div className="logo-section" onClick={() => init.setViewState('home')} style={{ cursor: 'pointer' }}>
            <span className="logo-emoji">🌳</span>
            <h1>{init.currentTreeName && init.tree ? `${init.currentTreeName}'s ${t('appTitle')}` : (init.viewState === 'home' && init.currentUser ? t('dashboardTitle') : t('appTitle'))}</h1>
          </div>

          {init.isSignedIn && (
            <LanguageSelector
              onLanguageChange={init.setLanguage}
            />
          )}
        </div>
      </header>

      <main className="app-main">
        {!init.isSignedIn ? (
          <LandingSection onSignIn={handleSignIn} onPrivacyClick={() => setShowPrivacy(true)} onTermsClick={() => setShowTerms(true)} />
        ) : init.viewState === 'home' ? (
          <Home
            userEmail={init.currentUser?.email || ''}
            onSelectTree={(id, view = 'tree') => {
              init.setCurrentTreeId(id);
              setViewMode(view as 'tree' | 'fanchart');
              init.loadTree(id);
              // init.setViewState('tree'); // loadTree sets viewState on success
            }}
            currentTreeId={init.currentTreeId}
            isEditor={true}
            enableAutoload={!disableAutoload}
          />
        ) : init.tree ? (
          <TreeViewSection
            tree={init.tree}
            currentUser={init.currentUser}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            editorMode={editorMode}
            setEditorMode={setEditorMode}
            editingNodeId={editingNodeId}
            setEditingNodeId={setEditingNodeId}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            collaboratorsOpen={collaboratorsOpen}
            setCollaboratorsOpen={setCollaboratorsOpen}
            findRelationOpen={findRelationOpen}
            setFindRelationOpen={setFindRelationOpen}
            versionHistoryOpen={versionHistoryOpen}
            setVersionHistoryOpen={setVersionHistoryOpen}
            viewMode={viewMode}
            setViewMode={setViewMode}
            dashboardOpen={dashboardOpen}
            setDashboardOpen={setDashboardOpen}
            onSaveMember={actions.handleSaveMember}
            onDeleteMember={actions.handleDeleteMember}
            onToggleEditor={actions.handleToggleEditor}
            onSignOut={handleSignOut}
            onSwitchTree={() => {
              setDisableAutoload(true);
              init.setViewState('home');
            }}
          />
        ) : (
          <div className="loading-state">
            <p>{t('loadingTree')}</p>
            <button onClick={() => init.setViewState('home')}>{t('backToHome')}</button>
          </div>
        )}

        {showPrivacy && (
          <div className="modal-overlay">
            <div className="modal-content full-screen pd-40" style={{ background: '#fff', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>{t('privacyPolicy')}</h2>
                <button className="close-all" onClick={() => setShowPrivacy(false)}>&times;</button>
              </div>
              <PrivacyPolicy />
            </div>
          </div>
        )}
        {showTerms && (
          <div className="modal-overlay">
            <div className="modal-content full-screen pd-40" style={{ background: '#fff', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>{t('termsOfService')}</h2>
                <button className="close-all" onClick={() => setShowTerms(false)}>&times;</button>
              </div>
              <TermsOfService />
            </div>
          </div>
        )}
      </main>

      {(init.viewState === 'home' && init.isSignedIn && !showPrivacy && !showTerms) && (
        <GeminiLiveButton
          tree={init.tree}
          currentUser={init.currentUser}
        />
      )}
    </div>
  );
}

export default App;
