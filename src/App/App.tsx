import { useState, useEffect, useRef } from 'react';
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
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [fanChartOpen, setFanChartOpen] = useState(false);
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
  const prevViewRef = useRef(init.viewState);

  useEffect(() => {
    // 1. Listen for back button (popstate)
    const handlePopState = (event: PopStateEvent) => {
      // If we are not home, go back to home
      if (init.viewState !== 'home') {
        init.setViewState('home');
      }
    };

    window.addEventListener('popstate', handlePopState);

    // 2. Push history state when moving AWAY from home
    if (prevViewRef.current === 'home' && init.viewState !== 'home') {
      window.history.pushState({ page: 'tree' }, '', '#tree');
    } else if (init.viewState === 'home' && prevViewRef.current !== 'home') {
      // If logic moved us home (e.g. button click), we might want to clear hash?
      // But we can't pop state programmatically safely without risking "Back" closing app.
      // Best to just replaceState to clean url if needed, or leave it.
      if (window.location.hash === '#tree') {
        // Replace current history entry to remove hash without adding new entry
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    prevViewRef.current = init.viewState;

    return () => window.removeEventListener('popstate', handlePopState);
  }, [init.viewState, init.setViewState]);

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
              setFanChartOpen(view === 'fanchart');
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
            fanChartOpen={fanChartOpen}
            setFanChartOpen={setFanChartOpen}
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

      {(init.viewState === 'home' && init.isSignedIn) && (
        <GeminiLiveButton
          tree={init.tree}
          currentUser={init.currentUser}
        />
      )}
    </div>
  );
}

export default App;
