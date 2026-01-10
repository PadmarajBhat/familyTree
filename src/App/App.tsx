import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from '../components/Home';
import { LoadingOverlay } from '../components/LoadingOverlay';
import PrivacyPolicy from '../components/PrivacyPolicy';
import TermsOfService from '../components/TermsOfService';
import { GeminiLiveButton } from '../components/GeminiLive';

import { useAppInitialization } from './hooks/useAppInitialization';
import { useMemberActions } from './hooks/useMemberActions';
import { TreeViewSection } from './components/TreeViewSection';
import { LandingSection } from './components/LandingSection';
import './App.css';

function App() {
  const { t } = useTranslation();

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

  return (
    <div className={`app-container ${isHome ? 'home-view' : 'tree-view-active'}`}>
      {init.loading && <LoadingOverlay message={init.loadingMessage} />}

      <header className="app-header">
        <div className="header-content">
          <div className="logo-section" onClick={() => init.setViewState('home')} style={{ cursor: 'pointer' }}>
            <span className="logo-emoji">🌳</span>
            <h1>{init.currentTreeName && init.tree ? `${init.currentTreeName}'s ${t('appTitle')}` : (init.viewState === 'home' && init.currentUser ? t('dashboardTitle') : t('appTitle'))}</h1>
          </div>
        </div>
      </header>

      <main className="app-main">
        {!init.isSignedIn ? (
          <LandingSection onSignIn={handleSignIn} onPrivacyClick={() => setShowPrivacy(true)} onTermsClick={() => setShowTerms(true)} />
        ) : init.viewState === 'home' ? (
          <Home
            userEmail={init.currentUser?.email || ''}
            onSelectTree={(id) => { init.setCurrentTreeId(id); init.setViewState('tree'); }}
            currentTreeId={init.currentTreeId}
            isEditor={true}
            enableAutoload={false}
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

      {Boolean(init.tree || import.meta.env.DEV) && (
        <GeminiLiveButton
          tree={init.tree}
          currentUser={init.currentUser}
        />
      )}
    </div>
  );
}

export default App;
