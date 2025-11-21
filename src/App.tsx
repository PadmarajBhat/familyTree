import { useEffect, useState } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent } from './services/drive';
import type { TreeDocument } from './logic/types';
import { TreeView } from './components/TreeView';
import { PersonDetail } from './components/PersonDetail';
import './App.css';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [tree, setTree] = useState<TreeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // const [isEditing, setIsEditing] = useState(false); // TODO: Implement edit mode

  useEffect(() => {
    initGoogleClient((signedIn) => {
      setIsSignedIn(signedIn);
    });
  }, []);

  useEffect(() => {
    loadTree();
  }, [isSignedIn]);

  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await listTreeFiles();
      if (files && files.length > 0) {
        const latestFile = files[0];
        const content = await getFileContent(latestFile.id);
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
    // setIsEditing(false);
  };

  const handleNodeLongPress = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    // setIsEditing(true);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Family Tree</h1>
        <div className="auth-controls">
          {isSignedIn ? (
            <button onClick={signOut}>Sign Out</button>
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
          </div>
        )}

        {tree && (
          <div className="tree-container">
            <TreeView
              data={tree}
              onNodeClick={handleNodeClick}
              onNodeLongPress={handleNodeLongPress}
            />
          </div>
        )}

        {selectedNodeId && tree && tree.nodes[selectedNodeId] && (
          <PersonDetail
            node={tree.nodes[selectedNodeId]}
            onClose={() => setSelectedNodeId(null)}
            onEdit={() => { }} // setIsEditing(true)
          />
        )}
      </main>
    </div>
  );
}

export default App;
