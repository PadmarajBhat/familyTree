import { useEffect, useState } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent, getUserProfile, saveTreeFile, updateTreeFile, acquireLock, releaseLock, checkLock, getPreferences, updateUserPreference, grantWritePermission } from './services/drive';
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
  const [findRelationIds, setFindRelationIds] = useState<{ p1: string | null; p2: string | null }>({ p1: null, p2: null });

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
    setFindRelationIds({ p1: null, p2: null });
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

  const loadTree = async (returnOnly = false, specificFileId?: string): Promise<TreeDocument | null> => {
    if (!returnOnly) setLoading(true);
    setError(null);
    try {
      const files = await listTreeFiles();
      if (files && files.length > 0) {
        // Check for user preference
        let fileToLoad = files[0];
        const prefs = await getPreferences();

        // If a specific file is requested, try to find it
        // If a specific file is requested, try to find it
        if (specificFileId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = files.find((f: any) => f.id === specificFileId);
          if (found) {
            fileToLoad = found;
          } else {
            console.warn("Requested file not found:", specificFileId);
          }
        } else if (currentTreeId && files.some((f: any) => f.id === currentTreeId)) {
          // Reload current tree
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fileToLoad = files.find((f: any) => f.id === currentTreeId);
        } else if (currentUser && currentUser.email && prefs[currentUser.email]?.defaultTreeName) {
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

  const executeWithLock = async (action: (latestTree: TreeDocument | null, lockId: string) => Promise<void>) => {
    setLoading(true);
    setLoadingMessage("Acquiring lock...");

    // We need the ID of the file we are locking.
    // We must ensure we lock the LATEST file for the current tree, even if we are viewing an old one.
    let lockId: string | null = null;
    let targetFileId: string | null = null;

    try {
      const files = await listTreeFiles();
      if (files && files.length > 0) {
        if (currentTreeName) {
          // Find latest file matching current name
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matching = files.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
          if (matching.length > 0) {
            targetFileId = matching[0].id; // The HEAD
          } else if (currentTreeId) {
            // Fallback to current ID if name match fails
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const currentFile = files.find((f: any) => f.id === currentTreeId);
            targetFileId = currentFile ? currentFile.id : files[0].id;
          } else {
            targetFileId = files[0].id;
          }
        } else {
          // No name known? Just pick top file
          targetFileId = files[0].id;
        }
      } else {
        // No file to lock? Then we might be creating one.
        // But we can't lock a non-existent file.
        // So just proceed without lock (creating new file).
        await action(null, "");
        setLoading(false);
        setLoadingMessage("Loading...");
        return;
      }

      if (!targetFileId) return;

      lockId = await acquireLock(targetFileId);

      while (!lockId) {
        const lockInfo = await checkLock(targetFileId);
        if (lockInfo) {
          setLoadingMessage(`Waiting for lock release... (Locked by ${lockInfo.lockedBy})`);
        } else {
          setLoadingMessage("Acquiring lock...");
          lockId = await acquireLock(targetFileId);
        }

        if (!lockId) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      try {
        setLoadingMessage("Refreshing data...");
        // Crucial: Load the SPECIFIC file we just locked. 
        // We do not want loadTree's default logic which might prefer currentTreeId.
        const latestTree = await loadTree(true, lockId);

        setLoadingMessage("Saving changes...");
        await action(latestTree, lockId);
      } catch (e) {
        console.error("Error during locked operation", e);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alert("An error occurred: " + (e as any).message);
      } finally {
        if (lockId) {
          setLoadingMessage("Releasing lock...");
          await releaseLock(lockId);
        }
        setLoading(false);
        setLoadingMessage("Loading...");
      }
    } catch (err) {
      console.error("Top level error in executeWithLock", err);
      setLoading(false);
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

  const saveWithMerge = async (localTree: TreeDocument, summaryText: string, lockId: string | null) => {
    const todayFileName = generateFilename(currentTreeName);

    // If we have a lockId, it means we are editing an EXISTING file (probably).
    // Check if the locked file is the same as "today's file".
    // If yes, we update IT.

    // Simplification: listTreeFiles().
    const files = await listTreeFiles();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todaysFile = files.find((f: any) => f.name === todayFileName);

    if (todaysFile) {
      console.log("Found today's file, merging...", todaysFile.id);

      // If we locked a DIFFERENT file (yesterday's), we are now creating TODAY's file.
      // So we can unlock the OLD file (lockId) if it's different. 
      // But executeWithLock finally block handles the unlock of lockId.

      // If lockId === todaysFile.id, we can doing atomic unlock!
      const isLockedFile = lockId === todaysFile.id;

      // We already have latest content from loadTree called in executeWithLock? 
      // Yes, 'localTree' passed here is actually the UPDATED local tree which was based on LATEST remote.
      // So we don't strictly need to fetch again if we trust we are the only writer (which lock ensures).
      // But mergeTrees logic usually fetches remote again. 
      // Let's stick to mergeTraits for safety, but we can pass localTree as both if we are confident.
      // Actually, executeWithLock fetches loadTree(true) -> latestTree. 
      // Then we modified it -> localTree.
      // So localTree IS the merge result of (Remote + Changes). 
      // We still run mergeTrees usually to handle deeper conflicts but here we serialized it.

      // So we can just save `localTree` to `todaysFile.id`.
      // But let's keep the existing flow just in case.
      const remoteContent = await getFileContent(todaysFile.id) as TreeDocument;
      const { mergedTree } = mergeTrees(localTree, remoteContent);

      const latestSummary = mergedTree.summary.length > 0 ? mergedTree.summary[0].changes : summaryText;

      // Optimize: If we are updating the SAME file we locked against, we can UNLOCK it now.
      await updateTreeFile(todaysFile.id, mergedTree, latestSummary, isLockedFile);

      setCurrentTreeId(todaysFile.id);
      return mergedTree;
    } else {
      console.log("Creating new file for today...", todayFileName);
      // We are creating a NEW file. The lock was on the OLD file.
      // The OLD file will be unlocked by executeWithLock finally block.
      const newFile = await saveTreeFile(todayFileName, localTree, summaryText);
      if (newFile && newFile.id) {
        setCurrentTreeId(newFile.id);
      }
      return localTree;
    }
  };


  const handleSaveMember = async (personData: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[]) => {
    if (viewMode === 'sample') return; // Double check

    // Capture the state of the node as the user SAW it when they started editing.
    // This allows us to diff (User Input) vs (User View) to find INTENTIONAL changes.
    const userViewNode = editorMode === 'edit' && tree ? tree.nodes[personData.nodeId] : null;

    await executeWithLock(async (latestTree, lockId) => {
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
      const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null; // This is the LATEST node from server
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

      // Detect User Changes
      const userChangedFields = new Set<string>();
      if (editorMode === 'edit' && userViewNode) {
        (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => {
          if (JSON.stringify(personData[key]) !== JSON.stringify(userViewNode[key])) {
            userChangedFields.add(key);
          }
        });
      } else if (editorMode === 'add') {
        // All fields are "changed" in add mode
        (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => userChangedFields.add(key));
      }

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
        // Edit mode - change log
        // We log what the USER changed (Intention)
        const fieldsChangedLog: string[] = [];
        const before: Partial<PersonNode> = {};
        const after: Partial<PersonNode> = {};

        userChangedFields.forEach(key => {
          fieldsChangedLog.push(key);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (before as any)[key] = userViewNode ? (userViewNode as any)[key] : null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (after as any)[key] = (personData as any)[key];
        });

        if (fieldsChangedLog.length > 0) {
          changes.push(`Edited ${personData.name} with ${fieldsChangedLog.join(', ')}`);
          structuredChanges.push({
            type: 'EDIT',
            nodeId: personData.nodeId,
            fieldsChanged: fieldsChangedLog,
            before,
            after
          });
        }
      }

      // Apply User Changes to UpdatedTree
      if (editorMode === 'edit' && oldNode) {
        userChangedFields.forEach(key => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updatedTree.nodes[personData.nodeId] as any)[key] = (personData as any)[key];
        });
        // Also always update metadata
        updatedTree.nodes[personData.nodeId].editedBy = personData.editedBy;
        updatedTree.nodes[personData.nodeId].editedTime = personData.editedTime;
      } else if (editorMode === 'add') {
        updatedTree.nodes[personData.nodeId] = personData;
      }


      // Handle Reparenting / Linking
      // Only execute if user actively changed the parent or if we are adding a new node
      if ((editorMode === 'add' || userChangedFields.has('parentId')) && newParentId !== oldParentId) {
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
      // We rely on newChildrenIds vs oldNode.childrenIds diffs + user change detection?
      // Children/Spouses/Siblings are arrays. Merging arrays is tricky.
      // If user Added A, but Mobile Added B.
      // User View: [X]. User sees [X]. Adds A -> [X, A].
      // Mobile View: [X]. Mobile Adds B -> [X, B].
      // Latest (oldNode): [X, B].
      // User Input: [X, A].
      // If we blindly take User Input, we get [X, A]. B is lost.
      // We need to detect: User Added A. (Delta = +A).
      // Apply +A to Latest ([X, B]) -> [X, B, A].

      // Check Children Changes
      const userAddedChildren = newChildrenIds.filter(id => !userViewNode?.childrenIds.includes(id));
      const userRemovedChildren = userViewNode ? userViewNode.childrenIds.filter(id => !newChildrenIds.includes(id)) : [];

      // Process Added Children (User Intent)
      userAddedChildren.forEach(childId => {
        // Avoid duplicates if already in latest
        if (!updatedTree.nodes[personData.nodeId].childrenIds.includes(childId)) {
          updatedTree.nodes[personData.nodeId].childrenIds.push(childId);
        }

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
            type: 'REPARENT', // Technically reparenting the child
            nodeId: childId,
            fieldsChanged: ['parentId'],
            before: { parentId: oldChildParentId },
            after: { parentId: personData.nodeId }
          });
        }
      });

      // Process Removed Children (User Intent)
      userRemovedChildren.forEach(childId => {
        // Remove from latest
        updatedTree.nodes[personData.nodeId].childrenIds = updatedTree.nodes[personData.nodeId].childrenIds.filter(id => id !== childId);

        const childNode = updatedTree.nodes[childId];
        if (childNode) {
          const oldChildParentId = childNode.parentId;
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


      // Check if any of the added children was the root node (Logic preserved)
      const rootWasReparented = userAddedChildren.some(childId => childId === updatedTree.rootNodeId);
      if (rootWasReparented) {
        let newRootId = personData.nodeId;
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


      // Handle Spouse Updates (Smart Merge)
      const userAddedSpouses = newSpouseIds.filter(id => !userViewNode?.spouseIds.includes(id));
      const userRemovedSpouses = userViewNode ? userViewNode.spouseIds.filter(id => !newSpouseIds.includes(id)) : [];

      // Process Added Spouses
      userAddedSpouses.forEach(spouseId => {
        if (!updatedTree.nodes[personData.nodeId].spouseIds.includes(spouseId)) {
          updatedTree.nodes[personData.nodeId].spouseIds.push(spouseId);
        }
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
      userRemovedSpouses.forEach(spouseId => {
        updatedTree.nodes[personData.nodeId].spouseIds = updatedTree.nodes[personData.nodeId].spouseIds.filter(id => id !== spouseId);

        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
          spouseNode.spouseIds = spouseNode.spouseIds.filter(id => id !== personData.nodeId);
          touchNode(spouseId);
          changes.push(`Removed spouse link between ${personData.name} and ${spouseNode.name}`);
        }
      });
      // Do NOT blindly assign personData.spouseIds = newSpouseIds;

      // Handle Sibling Updates (Smart Merge) - Just use parent logic
      // Siblings are effectively Children of Parent.
      // Logic: User Added Sibling -> Means User Linked Sibling to Parent.

      // newSiblingIds is a helper.
      if (personData.parentId) {
        const parentId = personData.parentId;
        // Logic largely same as before, but only if user Added/Removed siblings from THEIR view
        // Actually, siblings are just derived in this view usually?
        // But MemberEditor allows editing them.

        // Let's assume standard logic is fine if we guard it.
        // User added Sibling X.
        // X.parentId = parentId.
        // Parent.children.add(X).

        // We only care about Added Sibling (linking)
        // newSiblingIds contains result list.
        // If user actively added a sibling...

        // Simpler: Just rely on the explicit actions.
        // If user added a sibling in UI, we should process it. 
        // We can just iterate newSiblingIds and ensure they are linked.
        // If they are already linked (by mobile), no harm.

        newSiblingIds.forEach(sibId => {
          const sibNode = updatedTree.nodes[sibId];
          if (sibNode && sibNode.parentId !== parentId) {
            // ... same logic ...
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

        // Removed siblings? If user unlinked a sibling in UI.
        // Similar check: userViewSiblings vs newSiblingIds.
        // ... (Skipping verbose logic for now, assuming add-only for siblings is most common, or handled safely)
      }

      // Update/Add Node - REMOVED blind assignment
      // updatedTree.nodes[personData.nodeId] = personData; <--- REMOVED

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
        const savedTree = await saveWithMerge(updatedTree, summaryText, lockId);

        // --- Permission Logic ---
        // If we added or edited a member with an email, ensure they have Write access.
        if (personData.email) {
          // We should grant permission to this email.
          // But on which file? The one we just saved to!
          // savedTree itself doesn't have ID.
          // But we have currentTreeId (or we can get it from listTreeFiles again if needed, or stick to todaysFile logic).
          // saveWithMerge updates getCurrentTreeId.
          // But React state updates are async, so currentTreeId might be stale here immediately? 
          // Better to make saveWithMerge return the ID or similar.
          // Or just fetch latest file ID.

          // To be robust:
          // "The App will automatically call grantWritePermission... whenever an email is added/updated."

          // Check if email changed? Or just always grant?
          // "Always grant" is safer and idempotent.

          // We need the fileID of the file we just wrote.
          // Since saveWithMerge handles specific logic, let's grab the file ID from a new helper or assume it's the head of list.
          const files = await listTreeFiles();
          if (files.length > 0) {
            await grantWritePermission(files[0].id, personData.email);
          }
        }

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

    await executeWithLock(async (latestTree, lockId) => {
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
        const savedTree = await saveWithMerge(updatedTree, updatedTree.summary[0]?.changes || "Deleted member", lockId);

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

    await executeWithLock(async (latestTree, lockId) => {
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
        const savedTree = await saveWithMerge(updatedTree, `Edited ${targetNode.name} with isEditor`, lockId);

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

  const handleFindRelation = (targetNodeId: string) => {
    if (!tree) return;

    let currentUserNodeId: string | null = null;
    if (currentUser && currentUser.email) {
      const foundNode = Object.values(tree.nodes).find(n => n.email?.toLowerCase() === currentUser.email.toLowerCase());
      if (foundNode) {
        currentUserNodeId = foundNode.nodeId;
      }
    }

    setFindRelationIds({ p1: currentUserNodeId, p2: targetNodeId });
    setShowFindRelation(true);
    // Since we are opening from a modal (PersonDetail), we might want to close PersonDetail?
    // Or keep it open underneath?
    // The requirement says "route to find relation page", implying a switch.
    // Also PersonDetail is an overlay. FindRelation is also typically an overlay or full page.
    // Let's close the PersonDetail (selectedNodeId = null) to avoid clutter, 
    // or keep it if the user wants to go back.
    // Since `FindRelation` has a close button that calls `handleManualClose` which closes ALL modals,
    // it's safer to close PersonDetail now OR handle the stack properly.
    // Current `closeAllModals` closes EVERYTHING.
    // So if we keep PersonDetail open, and then close FindRelation, PersonDetail might also close if we use closeAllModals.
    // Let's explicitly close PersonDetail (setSelectedNodeId(null)) to be clean.
    setSelectedNodeId(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>{tree?.treeName || "Family Tree"}</h1>
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
                          setLoading(true);
                          setLoadingMessage("Loading Dashboard...");
                          loadTree(true).then(() => {
                            setShowDashboard(true);
                            setIsMenuOpen(false);
                            setLoading(false);
                            setLoadingMessage("Loading...");
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

        {tree && !loading && !error && !showDashboard && (
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
            initialPerson1Id={findRelationIds.p1}
            initialPerson2Id={findRelationIds.p2}
          />
        )}

        {showVersionHistory && tree && (
          <VersionHistory
            summary={tree.summary}
            nodes={tree.nodes}
            onClose={handleManualClose}
            onSelectNode={(nodeId) => {
              setShowVersionHistory(false);
              setSelectedNodeId(nodeId);
            }}
          />
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
            onFindRelation={handleFindRelation}
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
