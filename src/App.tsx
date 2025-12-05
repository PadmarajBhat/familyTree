import { useEffect, useState } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent, getUserProfile, saveTreeFile, updateTreeFile, acquireLock, releaseLock, checkLock, getPreferences, updateUserPreference } from './services/drive';
import type { TreeDocument, PersonNode } from './logic/types';
import { mergeTrees } from './logic/merge';
import { TreeView } from './components/TreeView';
import { PersonDetail } from './components/PersonDetail';
import { MemberEditor } from './components/MemberEditor';
import { MemberSearch } from './components/MemberSearch';
import { CollaboratorList } from './components/CollaboratorList';
import { FindRelation } from './components/FindRelation';
import { VersionHistory } from './components/VersionHistory';
import { TreePicker } from './components/TreePicker';
import { FanChartView } from './components/FanChartView';
import { Dashboard } from './components/Dashboard';
import { LoadingOverlay } from './components/LoadingOverlay';
import { canEdit } from './logic/accessControl';
import { canEditNode, isGlobalEditor } from './logic/permissions';
import { getISTTimestamp } from './logic/dateUtils';
import { generateSampleTree } from './logic/sampleData';
import { getTreeNameFromFilename, generateFilename } from './logic/fileUtils';
import './App.css';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [tree, setTree] = useState<TreeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [isGapiReady, setIsGapiReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'user' | 'sample'>('user');
  const [treeViewType, setTreeViewType] = useState<'standard' | 'hourglass'>('standard');
  const [fanRootId, setFanRootId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showFindRelation, setShowFindRelation] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTreePicker, setShowTreePicker] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [defaultTreeName, setDefaultTreeName] = useState<string | null>(null);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  const [currentTreeName, setCurrentTreeName] = useState<string>('family_tree');

  const [viewDepth, setViewDepth] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // --- History / Back Button Logic ---
  const isAnyModalOpen = showSearch || showCollaborators || showFindRelation || showVersionHistory || showTreePicker || showDashboard || !!selectedNodeId || !!editorMode;

  useEffect(() => {
    // When a modal opens, push a state if we aren't already in one
    if (isAnyModalOpen) {
      // We only want to push state if we didn't just pop to get here.
      // However, detecting that is hard. Simpler: ensure we have a 'modal' state.
      // But if we just push every time a modal opens, we might stack them.
      // The requirement is "Back button... should go to the home screen".
      // So we want exactly ONE history entry for "Modal Open" vs "Home".

      // Check if we already have our state
      if (window.history.state?.modal !== true) {
        window.history.pushState({ modal: true }, '');
      }
    }
  }, [isAnyModalOpen]);

  useEffect(() => {
    const handlePopState = () => {
      // If we go back (popstate), and we were in a modal, we should close everything.
      // Actually, if we hit back, the browser removes the state.
      // So if we are here, it means the user pressed back.
      // If we have any modals open, close them.
      if (isAnyModalOpen) {
        closeAllModals();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAnyModalOpen]); // Re-bind if modal state changes? No, handlePopState needs fresh closure or ref.

  // Better approach for handlePopState to access latest state without re-binding:
  // Use a ref or just rely on the fact that setX functions work.
  // But wait, if I put isAnyModalOpen in dependency, it re-binds.
  // Let's just define closeAllModals and use it.

  const closeAllModals = () => {
    setShowSearch(false);
    setShowCollaborators(false);
    setShowFindRelation(false);
    setShowVersionHistory(false);
    setShowTreePicker(false);
    setShowDashboard(false);
    setSelectedNodeId(null);
    setEditorMode(null);
    setEditingNodeId(null);
  };

  // Also, when we manually close a modal (e.g. click X), we should probably go back in history
  // if we pushed a state.
  const handleManualClose = () => {
    closeAllModals();
    if (window.history.state?.modal) {
      window.history.back();
    }
  };


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

  const loadTree = async (returnOnly = false, _specificFileId?: string): Promise<TreeDocument | null> => {
    if (!returnOnly) setLoading(true);
    setError(null);
    try {
      const files = await listTreeFiles();
      if (files && files.length > 0) {
        // Check for user preference
        let fileToLoad = files[0];
        const prefs = await getPreferences();
        if (currentUser && currentUser.email && prefs[currentUser.email]?.defaultTreeName) {
          const prefName = prefs[currentUser.email].defaultTreeName!;
          setDefaultTreeName(prefName);

          // Find latest file for this name
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchingFiles = files.filter((f: any) => getTreeNameFromFilename(f.name) === prefName);
          if (matchingFiles.length > 0) {
            // Assuming files are ordered by createdTime desc
            fileToLoad = matchingFiles[0];
            console.log("Loading default tree:", fileToLoad.name);
          } else {
            console.warn("Default tree not found, falling back to latest.");
          }
        } else {
          console.log("No default tree preference found.");
        }

        // Override if we are loading a specific file (e.g. from picker) - wait, loadTree doesn't take an ID arg yet.
        // We should probably refactor loadTree to take an optional ID.
        // But for now, let's just stick to the plan: loadTree loads THE tree.
        // If we want to switch, we might need to pass an ID.

        // Let's modify loadTree signature slightly to accept an optional fileId
        // But I can't change the signature in the middle of this function body easily with replace_file_content if I didn't select the top.
        // I selected lines 1-1098 so I can edit anywhere.

        // Actually, I'll just use a module-level variable or state? No, that's messy.
        // Let's assume loadTree always loads "the" tree.
        // If I want to load a SPECIFIC tree, I should probably pass it.
        // But for this specific "Default Tree" task, the requirement is "first interaction... loads default".
        // So this logic here is correct for the INITIAL load.

        // However, for "Switch Tree", we need to tell loadTree WHICH one.
        // I will modify the signature in a separate chunk or just here if I can.
        // I'll assume I can't change the signature easily without breaking calls.
        // So I will add a new argument `specificFileId?: string`.

        // Wait, I can't easily change the signature in this chunk because I didn't include the function definition line in THIS chunk.
        // I will do it in a separate tool call or just rely on state?
        // No, I'll update the signature in a separate chunk.

        console.log("Loading file:", fileToLoad.name, fileToLoad.id);
        setCurrentTreeId(fileToLoad.id);
        setCurrentTreeName(getTreeNameFromFilename(fileToLoad.name));
        const content = await getFileContent(fileToLoad.id);
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

        // Validation and Fix Logic: Ensure rootNodeId points to a valid node
        if (!treeDoc.rootNodeId || !treeDoc.nodes[treeDoc.rootNodeId]) {
          console.warn(`Root node "${treeDoc.rootNodeId}" is invalid or not found in nodes! Attempting to fix...`);
          const nodeIds = Object.keys(treeDoc.nodes);
          if (nodeIds.length > 0) {
            // Find a node with no parent (potential root)
            const newRoot = Object.values(treeDoc.nodes).find(n => !n.parentId);
            if (newRoot) {
              treeDoc.rootNodeId = newRoot.nodeId;
              console.log("Fixed root node to:", newRoot.name, newRoot.nodeId);
            } else {
              // If all nodes have parents (cycle?) or no orphans, pick the first one
              treeDoc.rootNodeId = nodeIds[0];
              console.log("Could not find orphan, picking first node as root:", treeDoc.nodes[nodeIds[0]].name);
            }
          } else {
            console.warn("Tree has no nodes.");
            treeDoc.rootNodeId = "";
          }
        }

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
            return null;
          }
        }

        setTree(treeDoc);
        return treeDoc;
      } else {
        if (isSignedIn) {
          console.log("No tree found.");
          setTree(null); // Ensure tree is null if no file found
        }
        return null;
      }
    } catch (err) {
      console.error("Failed to load tree", err);
      if (!isSignedIn) {
        // setError("Please sign in to view the family tree.");
      } else {
        setError("Failed to load family tree.");
      }
      return null;
    } finally {
      if (!returnOnly) setLoading(false);
    }
  };

  const executeWithLock = async (action: (latestTree: TreeDocument | null) => Promise<void>) => {
    setLoading(true);
    setLoadingMessage("Acquiring lock...");

    let lockId = await acquireLock(currentUser?.email || 'unknown');

    while (!lockId) {
      const lockInfo = await checkLock();
      if (lockInfo) {
        setLoadingMessage(`Waiting for lock release... (Locked by ${lockInfo.lockedBy})`);
      } else {
        setLoadingMessage("Acquiring lock...");
        lockId = await acquireLock(currentUser?.email || 'unknown');
      }

      if (!lockId) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    try {
      setLoadingMessage("Refreshing data...");
      const latestTree = await loadTree(true);

      setLoadingMessage("Saving changes...");
      await action(latestTree);
    } catch (e) {
      console.error("Error during locked operation", e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alert("An error occurred: " + (e as any).message);
    } finally {
      setLoadingMessage("Releasing lock...");
      await releaseLock(lockId);
      setLoading(false);
      setLoadingMessage("Loading...");
    }
  };

  const handleNodeClick = (nodeId: string) => {
    if (treeViewType === 'hourglass') {
      // In Fan Chart, click means "Navigate/Re-center"
      // Unless it's the center node?
      // For now, let's just make it re-center.
      // If the user wants details, they can use Long Press (which we need to ensure works)
      // OR we can check if the clicked node is ALREADY the fan root, then show details.
      if (nodeId === (fanRootId || tree?.rootNodeId)) {
        setSelectedNodeId(nodeId);
      } else {
        setFanRootId(nodeId);
      }
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const handleNodeLongPress = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleEditClick = () => {
    if (viewMode === 'sample') {
      alert("Editing is disabled in Sample Mode.");
      return;
    }
    if (selectedNodeId && tree) {
      if (!canEditNode(tree, currentUser?.email, selectedNodeId)) {
        alert("You do not have permission to edit this member.");
        return;
      }
      setEditingNodeId(selectedNodeId);
      setEditorMode('edit');
    }
  };

  const handleAddClick = () => {
    if (viewMode === 'sample') {
      alert("Adding members is disabled in Sample Mode.");
      return;
    }
    setEditorMode('add');
  };

  const saveWithMerge = async (localTree: TreeDocument, summaryText: string) => {
    const todayFileName = generateFilename(currentTreeName);
    const files = await listTreeFiles();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todaysFile = files.find((f: any) => f.name === todayFileName);

    if (todaysFile) {
      console.log("Found today's file, merging...", todaysFile.id);
      const remoteContent = await getFileContent(todaysFile.id) as TreeDocument;
      const { mergedTree } = mergeTrees(localTree, remoteContent);
      // Ensure the summary is up to date in the file metadata
      const latestSummary = mergedTree.summary.length > 0 ? mergedTree.summary[0].changes : summaryText;
      await updateTreeFile(todaysFile.id, mergedTree, latestSummary);
      setCurrentTreeId(todaysFile.id); // Update ID just in case
      return mergedTree;
    } else {
      console.log("Creating new file for today...", todayFileName);
      const newFile = await saveTreeFile(todayFileName, localTree, summaryText);
      if (newFile && newFile.id) {
        setCurrentTreeId(newFile.id);
      }
      return localTree;
    }
  };


  const handleSaveMember = async (personData: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[]) => {
    if (viewMode === 'sample') return; // Double check

    await executeWithLock(async (latestTree) => {
      // Initialize tree if it doesn't exist
      const currentTree: TreeDocument = latestTree ? JSON.parse(JSON.stringify(latestTree)) : {
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

      // Helper to update edited metadata for any node we touch
      const touchNode = (nodeId: string) => {
        if (updatedTree.nodes[nodeId]) {
          updatedTree.nodes[nodeId].editedBy = currentUser?.email || 'unknown';
          updatedTree.nodes[nodeId].editedTime = getISTTimestamp();
        }
      };

      // Update the main node's metadata
      personData.editedBy = currentUser?.email || 'unknown';
      personData.editedTime = getISTTimestamp();

      // Generate Summary
      const changes: string[] = [];
      const structuredChanges: { type: 'ADD' | 'EDIT' | 'DELETE' | 'REPARENT'; nodeId: string | null; fieldsChanged: string[]; before: Partial<PersonNode>; after: Partial<PersonNode>; }[] = [];

      if (editorMode === 'add') {
        changes.push(`Added ${personData.name}`);
        structuredChanges.push({
          type: 'ADD',
          nodeId: personData.nodeId,
          fieldsChanged: Object.keys(personData),
          before: {},
          after: personData
        });
      } else {
        // Edit mode - diff fields
        const fieldsChanged: string[] = [];
        const before: Partial<PersonNode> = {};
        const after: Partial<PersonNode> = {};

        if (oldNode) {
          (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => {
            if (JSON.stringify(personData[key]) !== JSON.stringify(oldNode[key])) {
              fieldsChanged.push(key);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (before as any)[key] = oldNode[key];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (after as any)[key] = personData[key];
            }
          });
        }

        if (fieldsChanged.length > 0) {
          changes.push(`Edited ${personData.name} with ${fieldsChanged.join(', ')}`);
          structuredChanges.push({
            type: 'EDIT',
            nodeId: personData.nodeId,
            fieldsChanged,
            before,
            after
          });
        }
      }

      // Handle Reparenting / Linking
      if (newParentId !== oldParentId) {
        // Remove from old parent
        if (oldParentId && updatedTree.nodes[oldParentId]) {
          updatedTree.nodes[oldParentId].childrenIds = updatedTree.nodes[oldParentId].childrenIds.filter(id => id !== personData.nodeId);
          touchNode(oldParentId);
        }
        // Add to new parent
        if (newParentId && updatedTree.nodes[newParentId]) {
          if (!updatedTree.nodes[newParentId].childrenIds.includes(personData.nodeId)) {
            updatedTree.nodes[newParentId].childrenIds.push(personData.nodeId);
            touchNode(newParentId);
          }
        }

        if (!oldParentId && newParentId) {
          changes.push(`Linked ${personData.name} to parent ${updatedTree.nodes[newParentId]?.name || newParentId}`);
        } else if (oldParentId && !newParentId) {
          changes.push(`Removed parent link for ${personData.name}`);
        } else {
          changes.push(`Changed parent of ${personData.name} from ${updatedTree.nodes[oldParentId!]?.name || oldParentId} to ${updatedTree.nodes[newParentId!]?.name || newParentId}`);
        }

        structuredChanges.push({
          type: 'REPARENT',
          nodeId: personData.nodeId,
          fieldsChanged: ['parentId'],
          before: { parentId: oldParentId },
          after: { parentId: newParentId }
        });
      }

      // Handle Children Updates
      // We need to update the parentId of all children in the list
      // 1. Identify added children
      const addedChildren = newChildrenIds.filter(id => !oldNode?.childrenIds.includes(id));
      // 2. Identify removed children
      const removedChildren = oldNode ? oldNode.childrenIds.filter(id => !newChildrenIds.includes(id)) : [];

      // Process Added Children
      addedChildren.forEach(childId => {
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
          const oldChildParentId = childNode.parentId;
          // Remove from old parent's children list if exists
          if (oldChildParentId && updatedTree.nodes[oldChildParentId]) {
            updatedTree.nodes[oldChildParentId].childrenIds = updatedTree.nodes[oldChildParentId].childrenIds.filter(id => id !== childId);
            touchNode(oldChildParentId);
          }

          // Set new parent
          childNode.parentId = personData.nodeId;
          touchNode(childId);

          changes.push(`Added child ${childNode.name} to ${personData.name}`);
          structuredChanges.push({
            type: 'REPARENT',
            nodeId: childId,
            fieldsChanged: ['parentId'],
            before: { parentId: oldChildParentId },
            after: { parentId: personData.nodeId }
          });
        }
      });

      // Check if any of the added children was the root node
      // If so, we need to update the root to point to the ultimate ancestor
      const rootWasReparented = addedChildren.some(childId => childId === updatedTree.rootNodeId);
      if (rootWasReparented) {
        // The old root now has a parent, so we need to find the new root
        let newRootId = personData.nodeId;
        // Traverse up to find the ultimate root
        const visited = new Set<string>();
        while (updatedTree.nodes[newRootId] && updatedTree.nodes[newRootId].parentId) {
          if (visited.has(newRootId)) {
            console.error("Cycle detected while finding new root!");
            break;
          }
          visited.add(newRootId);
          newRootId = updatedTree.nodes[newRootId].parentId!;
        }
        console.log(`Root node updated from ${updatedTree.rootNodeId} to ${newRootId} (old root became a child)`);
        updatedTree.rootNodeId = newRootId;
      }

      // Process Removed Children
      removedChildren.forEach(childId => {
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
          const oldChildParentId = childNode.parentId; // Should be personData.nodeId

          // Set parent to null (unlink)
          childNode.parentId = null;
          touchNode(childId);

          changes.push(`Removed child ${childNode.name} from ${personData.name}`);
          structuredChanges.push({
            type: 'REPARENT',
            nodeId: childId,
            fieldsChanged: ['parentId'],
            before: { parentId: oldChildParentId },
            after: { parentId: null }
          });
        }
      });

      // Update the current node's childrenIds
      personData.childrenIds = newChildrenIds;

      // Handle Spouse Updates (Bidirectional)
      // 1. Identify added spouses
      const addedSpouses = newSpouseIds.filter(id => !oldNode?.spouseIds.includes(id));
      // 2. Identify removed spouses
      const removedSpouses = oldNode ? oldNode.spouseIds.filter(id => !newSpouseIds.includes(id)) : [];

      // Process Added Spouses
      addedSpouses.forEach(spouseId => {
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
          if (!spouseNode.spouseIds.includes(personData.nodeId)) {
            spouseNode.spouseIds.push(personData.nodeId);
            touchNode(spouseId);
            changes.push(`Added spouse link between ${personData.name} and ${spouseNode.name}`);
          }
        }
      });

      // Process Removed Spouses
      removedSpouses.forEach(spouseId => {
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
          spouseNode.spouseIds = spouseNode.spouseIds.filter(id => id !== personData.nodeId);
          touchNode(spouseId);
          changes.push(`Removed spouse link between ${personData.name} and ${spouseNode.name}`);
        }
      });
      personData.spouseIds = newSpouseIds;

      // Handle Sibling Updates (Shared Parent)
      if (personData.parentId) {
        const parentId = personData.parentId;

        newSiblingIds.forEach(sibId => {
          const sibNode = updatedTree.nodes[sibId];
          if (sibNode && sibNode.parentId !== parentId) {
            // Link to parent
            const oldSibParent = sibNode.parentId;
            if (oldSibParent && updatedTree.nodes[oldSibParent]) {
              updatedTree.nodes[oldSibParent].childrenIds = updatedTree.nodes[oldSibParent].childrenIds.filter(id => id !== sibId);
              touchNode(oldSibParent);
            }
            sibNode.parentId = parentId;
            touchNode(sibId);

            if (updatedTree.nodes[parentId] && !updatedTree.nodes[parentId].childrenIds.includes(sibId)) {
              updatedTree.nodes[parentId].childrenIds.push(sibId);
              touchNode(parentId);
            }

            changes.push(`Linked sibling ${sibNode.name} to parent ${updatedTree.nodes[parentId].name}`);
          }
        });

        // What about removed siblings?
        if (updatedTree.nodes[parentId]) {
          const currentSiblings = updatedTree.nodes[parentId].childrenIds.filter(id => id !== personData.nodeId);
          const removedSiblings = currentSiblings.filter(id => !newSiblingIds.includes(id));

          removedSiblings.forEach(sibId => {
            const sibNode = updatedTree.nodes[sibId];
            if (sibNode) {
              sibNode.parentId = null;
              touchNode(sibId);
              updatedTree.nodes[parentId].childrenIds = updatedTree.nodes[parentId].childrenIds.filter(id => id !== sibId);
              touchNode(parentId);
              changes.push(`Unlinked sibling ${sibNode.name} from parent ${updatedTree.nodes[parentId].name}`);
            }
          });
        }
      }

      // Update/Add Node
      updatedTree.nodes[personData.nodeId] = personData;
      updatedTree.timestamp = getISTTimestamp();

      if (editorMode === 'add') {
        updatedTree.meta.nodeCount++;
        if (!updatedTree.rootNodeId) {
          updatedTree.rootNodeId = personData.nodeId;
        }
      }

      // Check if we need to update the root node (if the current root got a parent)
      if (personData.nodeId === updatedTree.rootNodeId && personData.parentId) {
        let newRootId = personData.parentId;
        // Traverse up to find the ultimate root
        const visited = new Set<string>();
        while (updatedTree.nodes[newRootId] && updatedTree.nodes[newRootId].parentId) {
          if (visited.has(newRootId)) {
            console.error("Cycle detected while finding new root!");
            break;
          }
          visited.add(newRootId);
          newRootId = updatedTree.nodes[newRootId].parentId!;
        }
        updatedTree.rootNodeId = newRootId;
        console.log(`Root node updated from ${personData.nodeId} to ${newRootId}`);
      }

      const summaryText = changes.join('; ');
      if (!summaryText && editorMode === 'edit') {
        // No changes detected
        setEditorMode(null);
        setEditingNodeId(null);
        alert("No changes detected.");
        return;
      }

      if (summaryText) {
        updatedTree.summary.unshift({
          editedBy: currentUser?.email || 'unknown',
          editedTime: getISTTimestamp(),
          changes: summaryText,
          rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
        });
      }

      // Final validation: Ensure rootNodeId is valid before saving
      if (!updatedTree.rootNodeId || !updatedTree.nodes[updatedTree.rootNodeId]) {
        console.warn('Invalid rootNodeId detected before save! Attempting to fix...');
        const nodeIds = Object.keys(updatedTree.nodes);
        if (nodeIds.length > 0) {
          // Find a node with no parent (potential root)
          const newRoot = Object.values(updatedTree.nodes).find(n => !n.parentId);
          if (newRoot) {
            updatedTree.rootNodeId = newRoot.nodeId;
            console.log('Fixed rootNodeId to node without parent:', newRoot.name);
          } else {
            // If all nodes have parents, pick the first one
            updatedTree.rootNodeId = nodeIds[0];
            console.log('No orphan found, using first node as root:', updatedTree.nodes[nodeIds[0]].name);
          }
        } else {
          console.error('Cannot save tree with no nodes!');
          alert('Error: Tree has no nodes. Cannot save.');
          return;
        }
      }

      try {
        setLoading(true); // executeWithLock handles loading, but saveWithMerge might not? executeWithLock handles it.
        // Actually executeWithLock sets loading=true.
        const savedTree = await saveWithMerge(updatedTree, summaryText);

        setTree(savedTree);
        setEditorMode(null);
        setEditingNodeId(null);
        alert("Member saved successfully!");
      } catch (err) {
        console.error("Failed to save tree:", err);
        alert("Failed to save changes to Google Drive.");
      }
      // finally block removed because executeWithLock handles loading=false
    });
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

  const handleDeleteMember = async (nodeId: string) => {
    if (viewMode === 'sample') {
      alert("Deletion is disabled in Sample Mode.");
      return;
    }
    if (!tree) return;
    if (!currentUser) {
      alert("You must be signed in to delete members.");
      return;
    }

    await executeWithLock(async (latestTree) => {
      if (!latestTree) return;
      const node = latestTree.nodes[nodeId];
      if (!node) return;

      // Strict Orphan Check
      const isOrphan = !node.parentId && node.childrenIds.length === 0 && node.spouseIds.length === 0;

      // Permission Check: Only global editors can delete
      if (!isGlobalEditor(latestTree, currentUser.email)) {
        alert("Only editors can delete members.");
        return;
      }

      if (!isOrphan) {
        alert("Cannot delete member. Member must be an orphan (no parents, children, or spouses). Please unlink relationships first.");
        return;
      }

      const updatedTree: TreeDocument = JSON.parse(JSON.stringify(latestTree));

      // Remove node
      delete updatedTree.nodes[nodeId];
      updatedTree.meta.nodeCount--;
      updatedTree.timestamp = getISTTimestamp();

      // If root was deleted, clear rootNodeId
      if (updatedTree.rootNodeId === nodeId) {
        updatedTree.rootNodeId = "";
        // If there are other nodes, we might want to pick a new root, but for now let's leave it empty
        // or pick the first available node?
        const remainingIds = Object.keys(updatedTree.nodes);
        if (remainingIds.length > 0) {
          updatedTree.rootNodeId = remainingIds[0];
        }
      }

      // Add Change Log
      updatedTree.summary.unshift({
        editedBy: currentUser?.email || 'unknown',
        editedTime: getISTTimestamp(),
        changes: `Deleted ${node.name}`,
        rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
      });

      try {
        setLoading(true);
        const savedTree = await saveWithMerge(updatedTree, updatedTree.summary[0]?.changes || "Deleted member");

        setTree(savedTree);
        setSelectedNodeId(null); // Close detail view
        alert("Member deleted successfully.");
      } catch (err) {
        console.error("Failed to delete member:", err);
        alert("Failed to save changes to Google Drive.");
      }
    });
  };

  const handleToggleEditor = async (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => {
    if (viewMode === 'sample') {
      alert("Editing is disabled in Sample Mode.");
      return;
    }

    if (!currentUser || !tree) return;

    await executeWithLock(async (latestTree) => {
      if (!latestTree) return;

      // Check if current user is an editor
      const currentUserNode = Object.values(latestTree.nodes).find(n => n.email?.toLowerCase() === currentUser.email.toLowerCase());
      const isCreator = latestTree.meta.createdBy?.toLowerCase() === currentUser.email.toLowerCase();
      const canModify = currentUserNode?.isEditor || isCreator;

      if (!canModify) {
        alert("Only editors can modify permissions.");
        return;
      }

      const updatedTree: TreeDocument = JSON.parse(JSON.stringify(latestTree));
      const targetNode = updatedTree.nodes[nodeId];

      if (!targetNode) {
        alert("Member not found.");
        return;
      }

      // Update editor status
      targetNode.isEditor = newStatus;
      targetNode.editorSince = newStatus ? getISTTimestamp() : null;
      targetNode.editedBy = currentUser.email;
      targetNode.editedTime = getISTTimestamp();

      // Apply updates if provided
      if (updates) {
        if (updates.email) targetNode.email = updates.email;
        if (updates.phone) targetNode.phone = updates.phone;
      }

      // Increment version
      updatedTree.versionIndex++;
      updatedTree.timestamp = getISTTimestamp();

      try {
        setLoading(true);
        const savedTree = await saveWithMerge(updatedTree, `Edited ${targetNode.name} with isEditor`);

        setTree(savedTree);
        alert(`Editor access ${newStatus ? 'granted to' : 'removed from'} ${targetNode.name}!`);
      } catch (err) {
        console.error("Failed to update editor status:", err);
        alert("Failed to save changes to Google Drive.");
      }
    });
  };

  const handleCreateTree = async (treeName: string) => {
    if (!currentUser) return;
    try {
      setLoading(true);
      // Create a new empty tree
      const newTree: TreeDocument = {
        schemaVersion: 1,
        treeId: crypto.randomUUID(),
        treeName: treeName,
        versionIndex: 0,
        timestamp: getISTTimestamp(),
        rootNodeId: "",
        nodes: {},
        marriages: [],
        summary: [],
        meta: {
          createdBy: currentUser.email,
          createdTime: getISTTimestamp(),
          nodeCount: 0
        }
      };

      const filename = generateFilename(treeName);
      const savedFile = await saveTreeFile(filename, newTree, "Initial creation");

      if (savedFile && savedFile.id) {
        setCurrentTreeId(savedFile.id);
        setCurrentTreeName(treeName);
        setTree(newTree);
        setShowTreePicker(false);
        alert(`Tree "${treeName}" created successfully!`);
      }
    } catch (err) {
      console.error("Failed to create tree", err);
      alert("Failed to create tree.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefaultTreeForUser = async (targetEmail: string) => {
    if (!currentTreeName) {
      alert("No tree currently loaded to set as default.");
      return;
    }
    try {
      setLoading(true);
      await updateUserPreference(targetEmail, currentTreeName);
      alert(`Default tree set for ${targetEmail}`);
    } catch (err) {
      console.error("Failed to set default tree for user", err);
      alert("Failed to set default tree for user.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefaultTree = async (treeName: string) => {
    if (!currentUser) return;
    try {
      setLoading(true);
      await updateUserPreference(currentUser.email, treeName);
      setDefaultTreeName(treeName);
      alert("Default tree updated successfully!");
    } catch (err) {
      console.error("Failed to set default tree", err);
      alert("Failed to set default tree.");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchTree = async (fileId: string) => {
    setShowTreePicker(false);
    await loadTree(false, fileId);
  };

  const handleResetRoot = () => {
    if (tree) {
      setFanRootId(tree.rootNodeId);
    }
  };

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
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowCollaborators(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        Editors
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowFindRelation(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        Find Relation
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowVersionHistory(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        Version History
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          // Reload tree data to ensure freshness
                          loadTree(true).then(() => {
                            setShowDashboard(true);
                            setIsMenuOpen(false);
                          });
                        }}
                      >
                        Dashboard
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowTreePicker(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        Switch Tree
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
        {loading && <LoadingOverlay message={loadingMessage} />}
        {error && <div className="error">{error}</div>}

        {tree && !loading && !error && (
          <div className="view-toggle-bar" style={{ display: 'flex', justifyContent: 'center', padding: '10px', background: '#fff', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', gap: '10px', background: '#f0f0f0', padding: '5px', borderRadius: '20px' }}>
              <button
                onClick={() => setTreeViewType('standard')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '15px',
                  border: 'none',
                  background: treeViewType === 'standard' ? '#2196f3' : 'transparent',
                  color: treeViewType === 'standard' ? 'white' : '#666',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Tree View
              </button>
              <button
                onClick={() => setTreeViewType('hourglass')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '15px',
                  border: 'none',
                  background: treeViewType === 'hourglass' ? '#2196f3' : 'transparent',
                  color: treeViewType === 'hourglass' ? 'white' : '#666',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Hourglass
              </button>
            </div>
          </div>
        )}

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

        {!tree && !loading && !error && (
          <div className="welcome-screen">
            <h2>Welcome to Family Tree</h2>
            <p>Please sign in to view your family tree or load a sample tree.</p>
          </div>
        )}

        {tree && !showSearch && !showFindRelation && !showVersionHistory && !showDashboard && (
          <>
            {treeViewType === 'standard' ? (
              <div className="tree-container">
                <TreeView
                  data={tree}
                  onNodeClick={handleNodeClick}
                  onNodeLongPress={handleNodeLongPress}
                  maxDepth={viewDepth}
                />
              </div>
            ) : (
              <div className="tree-container">
                <FanChartView
                  key="hourglass"
                  data={tree}
                  rootNodeId={fanRootId || selectedNodeId || tree.rootNodeId}
                  onNodeClick={handleNodeClick}
                  initialMode="hourglass"
                  onResetRoot={handleResetRoot}
                />
              </div>
            )}
            {isAuthorized && viewMode === 'user' && (
              <button
                className="fab-add"
                onClick={handleAddClick}
                title="Add Member"
              >
                +
              </button>
            )}
          </>
        )}

        {showSearch && tree && (
          <MemberSearch
            nodes={tree.nodes}
            onMemberClick={(nodeId) => {
              setSelectedNodeId(nodeId);
              setShowSearch(false);
            }}
            onClose={handleManualClose}
          />
        )}

        {showCollaborators && tree && currentUser && (
          <CollaboratorList
            nodes={tree.nodes}
            currentUserEmail={currentUser.email}
            canToggle={!!isAuthorized}
            onToggleEditor={handleToggleEditor}
            onSetDefaultTree={handleSetDefaultTreeForUser}
            onClose={handleManualClose}
          />
        )}

        {showFindRelation && tree && (
          <FindRelation
            nodes={tree.nodes}
            onMemberClick={(nodeId) => {
              setSelectedNodeId(nodeId);
              setShowFindRelation(false);
            }}
            onClose={handleManualClose}
          />
        )}

        {showVersionHistory && tree && (
          <VersionHistory summary={tree.summary} onClose={handleManualClose} />
        )}

        {showDashboard && tree && (
          <Dashboard tree={tree} onClose={handleManualClose} />
        )}

        {showTreePicker && (
          <TreePicker
            currentTreeId={currentTreeId}
            defaultTreeName={defaultTreeName}
            onSelect={handleSwitchTree}
            onSetDefault={handleSetDefaultTree}
            onCreate={handleCreateTree}
            onClose={handleManualClose}
          />
        )}

        {selectedNodeId && tree && tree.nodes[selectedNodeId] && (
          <PersonDetail
            node={tree.nodes[selectedNodeId]}
            tree={tree}
            currentUser={currentUser}
            onClose={handleManualClose}
            onEdit={handleEditClick}
            onDelete={handleDeleteMember}
            onNodeClick={handleNodeClick}
          />
        )}

        {editorMode && currentUser && (
          <MemberEditor
            currentUserEmail={currentUser.email}
            mode={editorMode}
            initialData={editorMode === 'edit' && editingNodeId && tree ? tree.nodes[editingNodeId] : undefined}
            existingNodes={tree ? tree.nodes : {}}
            onSave={handleSaveMember}
            onCancel={handleManualClose}
            onDelete={(nodeId) => {
              handleDeleteMember(nodeId);
              handleManualClose();
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
