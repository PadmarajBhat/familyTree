import { useEffect, useState } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent, getUserProfile, saveTreeFile } from './services/drive';
import type { TreeDocument, PersonNode } from './logic/types';
import { TreeView } from './components/TreeView';
import { PersonDetail } from './components/PersonDetail';
import { MemberEditor } from './components/MemberEditor';
import { MemberSearch } from './components/MemberSearch';
import { canEdit } from './logic/accessControl';
import { getISTTimestamp } from './logic/dateUtils';
import { generateSampleTree } from './logic/sampleData';
import './App.css';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [tree, setTree] = useState<TreeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isGapiReady, setIsGapiReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'user' | 'sample'>('user');
  const [showSearch, setShowSearch] = useState(false);

  const [viewDepth, setViewDepth] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
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
  }, [isSignedIn, isGapiReady]);

  useEffect(() => {
    if (!isSignedIn || !isGapiReady || !currentUser) return;

    if (viewMode === 'user') {
      loadTree();
    } else {
      handleLoadSampleTree();
    }
  }, [isSignedIn, isGapiReady, viewMode, currentUser]);

  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await listTreeFiles();
      if (files && files.length > 0) {
        const latestFile = files[0];
        console.log("Loading file:", latestFile.name, latestFile.id);
        const content = await getFileContent(latestFile.id);
        console.log("File content:", content);

        if (!content || typeof content !== 'object') {
          throw new Error("Invalid file content: Not an object");
        }
        // Basic validation
        if (!('nodes' in content) || !('rootNodeId' in content)) {
          console.error("Invalid tree structure:", content);
          throw new Error("Invalid tree structure: Missing nodes or rootNodeId");
        }

        const treeDoc = content as TreeDocument;

        // Access Control Check
        if (currentUser && currentUser.email) {
          const userEmail = currentUser.email.toLowerCase();
          const nodes = Object.values(treeDoc.nodes);
          const isMember = nodes.some(n => n.email?.toLowerCase() === userEmail);
          const isCreator = treeDoc.meta.createdBy?.toLowerCase() === userEmail;
          const isEmpty = nodes.length === 0;

          if (!isMember && !isCreator && !isEmpty) {
            alert("Access Denied: Your email is not listed in this family tree.");
            await signOut();
            setIsSignedIn(false);
            setCurrentUser(null);
            setTree(null);
            return;
          }
        }

        setTree(treeDoc);
      } else {
        if (isSignedIn) {
          console.log("No tree found.");
          setTree(null); // Ensure tree is null if no file found
        }
      }
    } catch (err) {
      console.error("Failed to load tree", err);
      if (!isSignedIn) {
        // setError("Please sign in to view the family tree.");
      } else {
        setError("Failed to load family tree.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleNodeLongPress = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleEditClick = () => {
    if (viewMode === 'sample') {
      alert("Editing is disabled in Sample Mode.");
      return;
    }
    if (selectedNodeId) {
      setEditingNodeId(selectedNodeId);
      setEditorMode('edit');
    }
  };

  const handleAddClick = () => {
    if (viewMode === 'sample') {
      alert("Adding members is disabled in Sample Mode.");
      return;
    }
    setEditingNodeId(null);
    setEditorMode('add');
  };

  const handleSaveMember = async (personData: PersonNode, newParentId: string | null) => {
    if (viewMode === 'sample') return; // Double check

    // Initialize tree if it doesn't exist
    const currentTree: TreeDocument = tree ? JSON.parse(JSON.stringify(tree)) : {
      schemaVersion: 1,
      treeId: crypto.randomUUID(),
      treeName: "Family Tree",
      versionIndex: 0,
      timestamp: getISTTimestamp(),
      rootNodeId: "",
      nodes: {},
      marriages: [],
      summary: [],
      meta: {
        createdBy: currentUser?.email || "unknown",
        createdTime: getISTTimestamp(),
        nodeCount: 0
      }
    };

    const updatedTree: TreeDocument = currentTree;
    const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null;
    const oldParentId = oldNode?.parentId || null;

    // Update/Add Node
    updatedTree.nodes[personData.nodeId] = personData;
    updatedTree.timestamp = getISTTimestamp();

    if (editorMode === 'add') {
      updatedTree.meta.nodeCount++;
      if (!updatedTree.rootNodeId) {
        updatedTree.rootNodeId = personData.nodeId;
      }
    }

    // Handle Reparenting / Linking
    if (newParentId !== oldParentId) {
      // Remove from old parent
      if (oldParentId && updatedTree.nodes[oldParentId]) {
        updatedTree.nodes[oldParentId].childrenIds = updatedTree.nodes[oldParentId].childrenIds.filter(id => id !== personData.nodeId);
      }
      // Add to new parent
      if (newParentId && updatedTree.nodes[newParentId]) {
        if (!updatedTree.nodes[newParentId].childrenIds.includes(personData.nodeId)) {
          updatedTree.nodes[newParentId].childrenIds.push(personData.nodeId);
        }
      }
    }

    try {
      setLoading(true);
      const fileName = `family_tree_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await saveTreeFile(fileName, updatedTree);

      setTree(updatedTree);
      setEditorMode(null);
      setEditingNodeId(null);
      alert("Member saved successfully!");
    } catch (err) {
      console.error("Failed to save tree:", err);
      alert("Failed to save changes to Google Drive.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSampleTree = async () => {
    console.log("handleLoadSampleTree called. CurrentUser:", currentUser);
    if (!currentUser) {
      console.warn("User not logged in, cannot generate sample tree.");
      return;
    }
    setLoading(true);
    try {
      console.log("Generating sample tree...");
      const sampleTree = generateSampleTree(currentUser.email);
      console.log("Sample tree generated:", sampleTree);
      console.log("Node count:", sampleTree.meta.nodeCount);
      setTree(sampleTree);
      // alert("Sample tree loaded!"); 
    } catch (err) {
      console.error("Failed to load sample tree:", err);
      alert("Failed to create sample tree.");
    } finally {
      setLoading(false);
    }
  };

  const isAuthorized = currentUser && canEdit(currentUser.email);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Family Tree</h1>
        <div className="auth-controls">
          {isSignedIn ? (
            <div className="menu-container">
              <button
                className="menu-button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label="Menu"
              >
                ☰
              </button>
              {isMenuOpen && (
                <div className="dropdown-menu">
                  <div className="menu-item user-label">{currentUser?.name}</div>
                  <div className="menu-divider"></div>
                  {tree && (
                    <>
                      <div className="menu-item">
                        <label>Generations: </label>
                        <select
                          value={viewDepth === null ? 'all' : viewDepth}
                          onChange={(e) => setViewDepth(e.target.value === 'all' ? null : Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="all">All</option>
                          <option value="3">3</option>
                          <option value="5">5</option>
                          <option value="7">7</option>
                        </select>
                      </div>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowSearch(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        Search Members
                      </button>
                    </>
                  )}
                  <button
                    className="menu-item"
                    onClick={() => {
                      setViewMode(prev => prev === 'user' ? 'sample' : 'user');
                      setIsMenuOpen(false);
                    }}
                  >
                    {viewMode === 'user' ? 'View Sample Tree' : 'View My Tree'}
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      signOut();
                      setIsMenuOpen(false);
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={signIn} disabled={!isGapiReady}>
              {isGapiReady ? 'Sign In' : '...'}
            </button>
          )}
        </div>
      </header>
      <main>
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">{error}</div>}

        {viewMode === 'sample' && (
          <div className="sample-banner" style={{ background: '#ff9800', color: 'white', padding: '10px', textAlign: 'center' }}>
            Sample Mode (Read Only)
          </div>
        )}

        {!loading && !tree && viewMode === 'user' && (
          <div className="welcome">
            <p>Welcome. Please sign in or ensure the tree is shared publicly.</p>
            {isAuthorized && !tree && (
              <div className="welcome-actions">
                <button onClick={handleAddClick}>Start New Tree</button>
              </div>
            )}
          </div>
        )}

        {tree && !showSearch && (
          <div className="tree-container">
            <TreeView
              data={tree}
              onNodeClick={handleNodeClick}
              onNodeLongPress={handleNodeLongPress}
              maxDepth={viewDepth}
            />
            {isAuthorized && viewMode === 'user' && (
              <button
                className="fab-add"
                onClick={handleAddClick}
                title="Add Member"
              >
                +
              </button>
            )}
          </div>
        )}

        {showSearch && tree && (
          <MemberSearch
            nodes={tree.nodes}
            onMemberClick={(nodeId) => {
              setSelectedNodeId(nodeId);
              setShowSearch(false);
            }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {selectedNodeId && tree && tree.nodes[selectedNodeId] && (
          <PersonDetail
            node={tree.nodes[selectedNodeId]}
            onClose={() => setSelectedNodeId(null)}
            onEdit={handleEditClick}
          />
        )}

        {editorMode && currentUser && (
          <MemberEditor
            currentUserEmail={currentUser.email}
            mode={editorMode}
            initialData={editorMode === 'edit' && editingNodeId && tree ? tree.nodes[editingNodeId] : undefined}
            existingNodes={tree ? tree.nodes : {}}
            onSave={handleSaveMember}
            onCancel={() => { setEditorMode(null); setEditingNodeId(null); }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
