import { useEffect, useState } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent, getUserProfile, saveTreeFile } from './services/drive';
import type { TreeDocument, PersonNode } from './logic/types';
import { TreeView } from './components/TreeView';
import { PersonDetail } from './components/PersonDetail';
import { MemberEditor } from './components/MemberEditor';
import { canEdit } from './logic/accessControl';
import { getISTTimestamp } from './logic/dateUtils';
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
      loadTree();
    } else if (!isSignedIn) {
      setCurrentUser(null);
      setTree(null);
    }
  }, [isSignedIn, isGapiReady]);

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

        setTree(content as TreeDocument);
      } else {
        if (isSignedIn) {
          console.log("No tree found.");
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
    if (selectedNodeId) {
      setEditingNodeId(selectedNodeId);
      setEditorMode('edit');
    }
  };

  const handleAddClick = () => {
    setEditingNodeId(null);
    setEditorMode('add');
  };

  const handleSaveMember = async (personData: PersonNode, newParentId: string | null) => {
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

  const isAuthorized = currentUser && canEdit(currentUser.email);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Family Tree</h1>
        <div className="auth-controls">
          {isSignedIn ? (
            <div className="user-info">
              <span>{currentUser?.name}</span>
              <button onClick={signOut}>Sign Out</button>
            </div>
          ) : (
            <button onClick={signIn}>Sign In with Google</button>
          )}
        </div>
      </header>
      <main>
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !tree && (
          <div className="welcome">
            <p>Welcome. Please sign in or ensure the tree is shared publicly.</p>
            {isAuthorized && !tree && (
              <button onClick={handleAddClick}>Start New Tree</button>
            )}
          </div>
        )}

        {tree && (
          <div className="tree-container">
            <TreeView
              data={tree}
              onNodeClick={handleNodeClick}
              onNodeLongPress={handleNodeLongPress}
            />
            {isAuthorized && (
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
