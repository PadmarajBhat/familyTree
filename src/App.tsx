
import { useEffect, useState, Suspense, lazy, useRef } from 'react';
import { initGoogleClient, signIn, signOut, listTreeFiles, getFileContent, getUserProfile, saveTreeFile, updateTreeFile, acquireLock, releaseLock, checkLock, getPreferences, grantWritePermission, grantLockFilePermission, renameFile, updateUserStarredTrees, saveNodesBatchToSheets, deleteNodesFromSheets, syncAllRelationshipsToSheets, migrateTreeToSheets, setAuthErrorCallback, searchNodesInSheets, getRecentNodesFromSheets, saveMetadataToSheets } from './services/drive';
import { useTranslation } from 'react-i18next';
import { GlobalTreeService } from './services/GlobalTreeService';
import type { TreeDocument, PersonNode } from './logic/types';
import { mergeTrees } from './logic/merge';
// Lazy Load Components
const TreeView = lazy(() => import('./components/TreeView').then(module => ({ default: module.TreeView })));
const PersonDetail = lazy(() => import('./components/PersonDetail').then(module => ({ default: module.PersonDetail })));
const MemberEditor = lazy(() => import('./components/MemberEditor').then(module => ({ default: module.MemberEditor })));
const MemberSearch = lazy(() => import('./components/MemberSearch').then(module => ({ default: module.MemberSearch })));
const CollaboratorList = lazy(() => import('./components/CollaboratorList').then(module => ({ default: module.CollaboratorList })));
const FindRelation = lazy(() => import('./components/FindRelation').then(module => ({ default: module.FindRelation })));
const VersionHistory = lazy(() => import('./components/VersionHistory').then(module => ({ default: module.VersionHistory })));
const FanChartView = lazy(() => import('./components/FanChartView').then(module => ({ default: module.FanChartView })));
const Home = lazy(() => import('./components/Home').then(module => ({ default: module.Home })));
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const IdentifyKin = lazy(() => import('./components/IdentifyKin').then(module => ({ default: module.IdentifyKin })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy')); // Default export
const TermsOfService = lazy(() => import('./components/TermsOfService')); // Default export
const GeminiLive = lazy(() => import('./components/GeminiLive').then(module => ({ default: module.GeminiLive })));

import { LoadingOverlay } from './components/LoadingOverlay';
import { canEdit } from './logic/accessControl';
import { canEditNode, isGlobalEditor } from './logic/permissions';
import { getISTTimestamp } from './logic/dateUtils';
import { generateAllTranslations } from './services/TransliterationService';

import { v4 as uuidv4 } from 'uuid';

import { getTreeNameFromFilename, generateFilename } from './logic/fileUtils';

import './App.css';

function App() {
  const { t, i18n } = useTranslation();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [tree, setTree] = useState<TreeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [isSheetsMode, setIsSheetsMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const recentToolCalls = useRef<Map<string, number>>(new Map());

  const [isGapiReady, setIsGapiReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  // viewMode state removed

  const [treeViewType, setTreeViewType] = useState<'standard' | 'hourglass'>('standard');
  const [fanRootId, setFanRootId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showFindRelation, setShowFindRelation] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [viewState, setViewState] = useState<'home' | 'tree'>('home');
  const [showDashboard, setShowDashboard] = useState(false);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  const [currentTreeName, setCurrentTreeName] = useState<string>('family_tree');
  const [findRelationIds, setFindRelationIds] = useState<{ p1: string | null; p2: string | null }>({ p1: null, p2: null });
  const [historyFilterNodeId, setHistoryFilterNodeId] = useState<string | null>(null);

  const [viewDepth, setViewDepth] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [homeAutoloadEnabled, setHomeAutoloadEnabled] = useState(true);
  const [staticPage, setStaticPage] = useState<'privacy' | 'terms' | null>(null);

  // --- History / Back Button Logic ---
  const isAnyModalOpen = showSearch || showCollaborators || showFindRelation || showVersionHistory || showDashboard || !!selectedNodeId || !!editorMode;

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
    // Use hash-based routing for GitHub Pages compatibility (avoids 404s on sub-paths)
    const hash = window.location.hash;
    if (hash === '#privacy-policy') {
      setStaticPage('privacy');
    } else if (hash === '#terms-of-service') {
      setStaticPage('terms');
    }
  }, []);

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
    setShowDashboard(false);
    setSelectedNodeId(null);
    setEditorMode(null);
    setEditingNodeId(null);
    setFindRelationIds({ p1: null, p2: null });
    setHistoryFilterNodeId(null);
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
    // Set up auth error callback before initializing client if possible, 
    // or just after it's imported.
    setAuthErrorCallback((err) => {
      console.warn("Auth Error caught in App:", err);
      if (err === 'interaction_required' || err === 'access_denied') {
        setAuthError(err);
      }
    });

    initGoogleClient((signedIn) => {
      if (signedIn) setAuthError(null); // Reset if success
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

  // Intelligent Prefetching
  useEffect(() => {
    if (tree && !loading) {
      const prefetchTimer = setTimeout(() => {
        console.log("Prefetching secondary components...");
        const prefetch = (importFn: () => Promise<unknown>) => {
          importFn().catch(err => console.debug("Prefetch failed ignored", err));
        };

        // Prefetch heavy/likely components
        prefetch(() => import('./components/Dashboard'));
        prefetch(() => import('./components/GeminiLive'));
        prefetch(() => import('./components/MemberEditor'));
        prefetch(() => import('./components/IdentifyKin'));
        prefetch(() => import('./components/PersonDetail'));
      }, 5000); // Wait 5s after load to avoid contention

      return () => clearTimeout(prefetchTimer);
    }
  }, [tree, loading]);

  // Sync GlobalTreeService with shortlisted trees for Unified Search
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
    if (!isSignedIn || !isGapiReady || !currentUser) return;

    // Logic for First Run / Default Tree
    const checkAccessAndLoad = async () => {
      setLoading(true);
      setLoadingMessage("Checking access...");

      try {
        // 1. Check Cloud Preferences first (Cross-device sync)
        let startingTrees: string[] = [];
        try {
          const prefs = await getPreferences();
          if (prefs && prefs[currentUser.email]?.starredTreeNames && prefs[currentUser.email].starredTreeNames!.length > 0) {
            startingTrees = prefs[currentUser.email].starredTreeNames!;
            console.log("Found starred trees:", startingTrees);
          } else if (prefs && prefs[currentUser.email]?.defaultTreeName) {
            // Legacy fallback
            startingTrees = [prefs[currentUser.email].defaultTreeName!];
          }
        } catch (e) {
          console.warn("Failed to load preferences", e);
        }

        // Helper to load by name
        const loadTreeByName = async (name: string): Promise<boolean> => {
          const files = await listTreeFiles();
          if (!files || !Array.isArray(files)) return false;

          // Logic to match tree name from filename (Name_family_tree.json or family_tree_Name_Date.json)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const consistentFiles = files.filter((f: any) => {
            if (!f.name) return false;
            // Check various patterns
            return f.name.startsWith(`${name}_family_tree`) ||
              f.name.startsWith(`family_tree_${name}`) ||
              f.name === `${name}_family_tree.json` ||
              f.name === `${name}.json`;
          });

          if (consistentFiles.length > 0) {
            // Load latest modified
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            consistentFiles.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
            await loadTree(false, consistentFiles[0].id);
            return true;
          }
          return false;
        };

        if (startingTrees.length > 0) {
          if (startingTrees.length === 1) {
            const success = await loadTreeByName(startingTrees[0]);
            if (success) {
              setViewState('tree');
              return;
            }
            console.warn("Starred tree not found in files, falling back to search.");
          } else {
            // Multiple stars -> Show Dashboard (Home with filter)
            console.log("Multiple starred trees found, showing dashboard.");
            setLoading(false);
            setViewState('home');
            return; // Let user pick
          }
        }

        // 2. Not found in prefs (or file missing), Search all trees
        setLoadingMessage("Scanning trees for your profile...");
        const result = await GlobalTreeService.findUserInTrees(currentUser.email);

        if (result) {
          console.log("User found in tree:", result.treeName);
          // Save as default for future (as Starred Tree)
          // We assume if they found it, that's their "Home" tree now.
          updateUserStarredTrees(currentUser.email, [result.treeName]).catch(console.error);

          // Load it
          await loadTree(false, result.treeId);
          setViewState('tree');
        } else {
          // 3. Not found anywhere -> Access Denied
          console.warn("User not found in any tree:", currentUser.email);
          setAccessDenied(true);
          setLoading(false);
          setViewState('home'); // or remain empty
        }

      } catch (e) {
        console.error("Error in access check:", e);
        setLoading(false);
      }
    };

    checkAccessAndLoad();
  }, [isSignedIn, isGapiReady, currentUser]);

  const handleMigrateToStage2 = async () => {
    if (!tree) return;
    setLoading(true);
    setLoadingMessage("Migrating to Stage 2 (Sheets)...");
    try {
      const success = await migrateTreeToSheets(tree);
      if (success) {
        alert("Migration successful! Reloading tree from Sheets...");
        window.location.reload();
      } else {
        alert("Migration failed. Please check console.");
      }
    } catch (err) {
      alert("Migration error.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };



  const loadTree = async (returnOnly = false, specificFileId?: string): Promise<TreeDocument | null> => {
    if (!returnOnly) setLoading(true);
    setError(null);
    setAccessDenied(false);

    try {
      // PHASE 2: Check for Sheets tree first
      const mainSheetsTree = await GlobalTreeService.loadMainTreeFromSheets();
      if (mainSheetsTree) {
        console.log("App: Successfully loaded tree from Sheets.");
        if (!returnOnly) {
          setTree(mainSheetsTree);
          setIsSheetsMode(true);
          setCurrentTreeId('sheets_main');
          setCurrentTreeName('Main Family Tree');
          setHomeAutoloadEnabled(false);
          setLoading(false);
        }
        return mainSheetsTree;
      }

      console.log("App: Sheets tree not found, falling back to JSON files...");
      setIsSheetsMode(false);

      const files = await listTreeFiles();
      if (files && files.length > 0) {
        // Check for user preference
        let fileToLoad = files[0];
        // prefs removed

        // If a specific file is requested, try to find it
        if (specificFileId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = files.find((f: any) => f.id === specificFileId);
          if (found) {
            fileToLoad = found;
          } else {
            // If specific ID is not found (e.g. from shortlist but file changed daily),
            // we should try to find the "latest" file for the same Tree Name if possible?
            // But we don't know the Tree Name from the ID.
            // However, Home.tsx now Shortlists IDs.
            // Major Issue: Shortlist stores IDs. But IDs change daily.
            // The loaded Tree Name should be stored in Shortlist instead of ID?
            // For now, let's assume the user clicked "Home", which loaded the LATEST ID for that tree.
            console.warn("Requested file ID not found:", specificFileId);
          }
        } else if (currentTreeId && files.some((f: any) => f.id === currentTreeId)) {
          // Reload current tree: we have ID, it exists.
          // But if we are reloading generally (e.g. refreshing), we might want the latest Daily file for current Tree Name?
          // Since we have currentTreeName state:
          if (currentTreeName) {
            // specific logic to find latest for this name
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const consistentFiles = files.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
            if (consistentFiles.length > 0) {
              // Sort desc
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              consistentFiles.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
              fileToLoad = consistentFiles[0];
            }
          } else {
            // fallback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fileToLoad = files.find((f: any) => f.id === currentTreeId);
          }
        }
        // If neither specific nor current valid, defaults to files[0] (latest in list usually?)

        console.log("Loading file:", fileToLoad.name, fileToLoad.id);
        setCurrentTreeId(fileToLoad.id);
        setCurrentTreeName(getTreeNameFromFilename(fileToLoad.name));

        const content = await getFileContent(fileToLoad.id);
        console.log("File content loaded."); // Reduced logging

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
            setAccessDenied(true);
            setTree(null);
            return null;
          }
        }

        // Hydrate Live Links (Shadow Nodes) from Global Cache
        GlobalTreeService.hydrateTree(treeDoc, files);

        // Register current tree for Unified Search
        GlobalTreeService.registerTree(fileToLoad.id, treeDoc);

        setTree(treeDoc);
        setHomeAutoloadEnabled(false);
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
        const latestTree = await loadTree(true, targetFileId!);

        setLoadingMessage("Saving changes...");
        await action(latestTree, lockId);

        // Force UI update with mutated tree
        setTree({ ...latestTree } as TreeDocument);
      } catch (e) {
        console.error("Error during locked operation", e);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = e as any;
        if (err?.status === 401 || err?.result?.error?.code === 401) {
          alert("Session expired. Please sign in again.");
          signOut();
          setIsSignedIn(false);
          return;
        }
        alert("An error occurred: " + err.message);
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
    // Edit click logic
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
    // Add logic
    setEditorMode('add');
  };

  const saveWithMerge = async (localTree: TreeDocument, summaryText: string, explicitDeletions: string[] = [], affectedNodeIds?: string[]) => {
    // PHASE 2: Sheets Mode logic
    if (isSheetsMode) {
      console.log("App: Saving in Sheets Mode (Selective Sync)...");
      setLoading(true);
      setLoadingMessage("Saving to Sheets...");
      try {
        // Parallelized Sync for Sheets Mode
        const syncTasks: Promise<any>[] = [];

        // 1. Sync Nodes (Selective if IDs provided, else all)
        const nodesToSync = affectedNodeIds
          ? affectedNodeIds.map(id => localTree.nodes[id]).filter(n => n && !n.externalLink) as PersonNode[]
          : Object.values(localTree.nodes).filter(n => !n.externalLink) as PersonNode[];

        if (nodesToSync.length > 0) {
          syncTasks.push(saveNodesBatchToSheets(nodesToSync));
        }

        // 2. Handle Deletions
        if (explicitDeletions.length > 0) {
          syncTasks.push(deleteNodesFromSheets(explicitDeletions));
        }

        // 3. Sync All Relationships (Keeps sheet clean and is very fast for < 500 nodes)
        syncTasks.push(syncAllRelationshipsToSheets(Object.values(localTree.nodes)));

        // 4. Sync Metadata for logical root preservation
        syncTasks.push(saveMetadataToSheets({
          treeId: localTree.treeId,
          treeName: localTree.treeName,
          rootNodeId: localTree.rootNodeId,
          schemaVersion: String(localTree.schemaVersion),
          versionIndex: String(localTree.versionIndex),
          timestamp: localTree.timestamp,
          createdBy: localTree.meta.createdBy,
          createdTime: localTree.meta.createdTime
        }));

        await Promise.all(syncTasks);

        setTree(localTree);
        GlobalTreeService.registerTree('sheets_main', localTree);
        return localTree;
      } finally {
        setLoading(false);
      }
    }

    const todayFileName = generateFilename(currentTreeName);
    const files = await listTreeFiles();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todaysFile = files.find((f: any) => f.name === todayFileName);

    if (todaysFile) {
      console.log("Found today's file, merging...", todaysFile.id);

      const remoteContent = await getFileContent(todaysFile.id) as TreeDocument;
      const { mergedTree } = mergeTrees(localTree, remoteContent);

      // Enforce explicit deletions to prevent resurrection by merge
      if (explicitDeletions.length > 0) {
        explicitDeletions.forEach(delId => {
          if (mergedTree.nodes[delId]) {
            console.log(`Enforcing deletion of ${delId} after merge.`);
            delete mergedTree.nodes[delId];
            mergedTree.meta.nodeCount = Object.keys(mergedTree.nodes).length;
          }
        });
      }

      const latestSummary = mergedTree.summary.length > 0 ? mergedTree.summary[0].changes : summaryText;

      await updateTreeFile(todaysFile.id, mergedTree, latestSummary, false);
      setCurrentTreeId(todaysFile.id);

      // Update cache
      GlobalTreeService.registerTree(todaysFile.id, mergedTree);

      return mergedTree;
    } else {
      console.log("Creating new file for today...", todayFileName);

      // SAFETY FIX: Save the NEW file first.
      // Do NOT rename the old file until we confirm the new one is safe.
      const newFile = await saveTreeFile(todayFileName, localTree, summaryText);

      if (newFile && newFile.id) {
        // New file saved successfully. Now we can safely archive the old one.
        if (currentTreeId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldFile = files.find((f: any) => f.id === currentTreeId);
          if (oldFile) {
            // Rename it (Fixed typo: removed trailing space)
            const backupName = `backup_${oldFile.name}`;
            console.log(`Renaming old file ${oldFile.name} to ${backupName}`);
            try {
              await renameFile(oldFile.id, backupName);
            } catch (e) {
              console.error("Failed to rename backup file", e);
              // Non-fatal: Data is safe in 'newFile'.
            }
          }
        }

        setCurrentTreeId(newFile.id);
        // Update cache
        GlobalTreeService.registerTree(newFile.id, localTree);
      } else {
        console.error("Failed to save new tree file.");
        throw new Error("Failed to save new tree version. Aborted backup of old file to prevent data loss.");
      }
      return localTree;
    }
  };

  const handleSaveMember = async (
    personData: PersonNode,
    newParentId: string | null,
    newChildrenIds: string[],
    newSpouseIds: string[],
    newSiblingIds: string[],
    shadowNodes: PersonNode[] = []
  ) => {
    // save logic

    const userViewNode = editorMode === 'edit' && tree ? tree.nodes[personData.nodeId] : null;

    await executeWithLock(async (latestTree, lockId) => {
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

      // Merge pending shadow nodes
      if (shadowNodes && shadowNodes.length > 0) {
        shadowNodes.forEach(shadow => {
          if (!currentTree.nodes[shadow.nodeId]) {
            currentTree.nodes[shadow.nodeId] = shadow;
          }
        });
      }

      const updatedTree: TreeDocument = currentTree;
      const oldNode = editorMode === 'edit' ? updatedTree.nodes[personData.nodeId] : null;
      const oldParentId = oldNode?.parentId || null;

      const affectedIds = new Set<string>();
      const touchNode = (nodeId: string) => {
        if (updatedTree.nodes[nodeId]) {
          updatedTree.nodes[nodeId].editedBy = currentUser?.email || 'unknown';
          updatedTree.nodes[nodeId].editedTime = getISTTimestamp();
          affectedIds.add(nodeId);
        }
      };

      affectedIds.add(personData.nodeId);
      personData.editedBy = currentUser?.email || 'unknown';
      personData.editedTime = getISTTimestamp();

      const userChangedFields = new Set<string>();
      if (editorMode === 'edit' && userViewNode) {
        (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => {
          if (JSON.stringify(personData[key]) !== JSON.stringify(userViewNode[key])) {
            userChangedFields.add(key);
          }
        });
      } else if (editorMode === 'add') {
        (Object.keys(personData) as (keyof PersonNode)[]).forEach(key => userChangedFields.add(key));
      }

      const changes: string[] = [];
      const structuredChanges: { type: 'ADD' | 'EDIT' | 'DELETE' | 'REPARENT'; nodeId: string | null; fieldsChanged: string[]; before: Partial<PersonNode>; after: Partial<PersonNode>; }[] = [];

      if (editorMode === 'add') {
        changes.push(`Added ${personData.name} `);
        structuredChanges.push({
          type: 'ADD',
          nodeId: personData.nodeId,
          fieldsChanged: Object.keys(personData),
          before: {},
          after: personData
        });
      } else {
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
          changes.push(`Edited ${personData.name} with ${fieldsChangedLog.join(', ')} `);
          structuredChanges.push({
            type: 'EDIT',
            nodeId: personData.nodeId,
            fieldsChanged: fieldsChangedLog,
            before,
            after
          });
        }
      }

      if (editorMode === 'edit' && oldNode) {
        userChangedFields.forEach(key => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updatedTree.nodes[personData.nodeId] as any)[key] = (personData as any)[key];
        });
        updatedTree.nodes[personData.nodeId].editedBy = personData.editedBy;
        updatedTree.nodes[personData.nodeId].editedTime = personData.editedTime;
      } else if (editorMode === 'add') {
        updatedTree.nodes[personData.nodeId] = personData;
      }

      if ((editorMode === 'add' || userChangedFields.has('parentId')) && newParentId !== oldParentId) {
        if (oldParentId && updatedTree.nodes[oldParentId]) {
          updatedTree.nodes[oldParentId].childrenIds = updatedTree.nodes[oldParentId].childrenIds.filter(id => id !== personData.nodeId);
          touchNode(oldParentId);
        }
        if (newParentId && updatedTree.nodes[newParentId]) {
          if (!updatedTree.nodes[newParentId].childrenIds.includes(personData.nodeId)) {
            updatedTree.nodes[newParentId].childrenIds.push(personData.nodeId);
            touchNode(newParentId);
          }
        }

        if (!oldParentId && newParentId) {
          changes.push(`Linked ${personData.name} to parent ${updatedTree.nodes[newParentId]?.name || newParentId} `);
        } else if (oldParentId && !newParentId) {
          changes.push(`Removed parent link for ${personData.name}`);
        } else {
          changes.push(`Changed parent of ${personData.name} from ${updatedTree.nodes[oldParentId!]?.name || oldParentId} to ${updatedTree.nodes[newParentId!]?.name || newParentId} `);
        }

        structuredChanges.push({
          type: 'REPARENT',
          nodeId: personData.nodeId,
          fieldsChanged: ['parentId'],
          before: { parentId: oldParentId },
          after: { parentId: newParentId }
        });
      }

      const userAddedChildren = newChildrenIds.filter(id => !userViewNode?.childrenIds.includes(id));
      const userRemovedChildren = userViewNode ? userViewNode.childrenIds.filter(id => !newChildrenIds.includes(id)) : [];

      userAddedChildren.forEach(childId => {
        if (!updatedTree.nodes[personData.nodeId].childrenIds.includes(childId)) {
          updatedTree.nodes[personData.nodeId].childrenIds.push(childId);
        }
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
          const oldChildParentId = childNode.parentId;
          if (oldChildParentId && updatedTree.nodes[oldChildParentId]) {
            updatedTree.nodes[oldChildParentId].childrenIds = updatedTree.nodes[oldChildParentId].childrenIds.filter(id => id !== childId);
            touchNode(oldChildParentId);
          }
          childNode.parentId = personData.nodeId;
          touchNode(childId);
          changes.push(`Added child ${childNode.name} to ${personData.name} `);
          structuredChanges.push({
            type: 'REPARENT',
            nodeId: childId,
            fieldsChanged: ['parentId'],
            before: { parentId: oldChildParentId },
            after: { parentId: personData.nodeId }
          });
        }
      });

      userRemovedChildren.forEach(childId => {
        updatedTree.nodes[personData.nodeId].childrenIds = updatedTree.nodes[personData.nodeId].childrenIds.filter(id => id !== childId);
        const childNode = updatedTree.nodes[childId];
        if (childNode) {
          const oldChildParentId = childNode.parentId;
          childNode.parentId = null;
          touchNode(childId);
          changes.push(`Removed child ${childNode.name} from ${personData.name} `);
          structuredChanges.push({
            type: 'REPARENT',
            nodeId: childId,
            fieldsChanged: ['parentId'],
            before: { parentId: oldChildParentId },
            after: { parentId: null }
          });
        }
      });

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
        console.log(`Root node updated from ${updatedTree.rootNodeId} to ${newRootId} `);
        updatedTree.rootNodeId = newRootId;
      }

      const userAddedSpouses = newSpouseIds.filter(id => !userViewNode?.spouseIds.includes(id));
      const userRemovedSpouses = userViewNode ? userViewNode.spouseIds.filter(id => !newSpouseIds.includes(id)) : [];

      userAddedSpouses.forEach(async spouseId => {
        if (!updatedTree.nodes[personData.nodeId].spouseIds.includes(spouseId)) {
          updatedTree.nodes[personData.nodeId].spouseIds.push(spouseId);
        }
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
          // If spouse is a Shadow Node (Live Link), update the remote tree too via GlobalTreeService
          if (spouseNode.externalLink && spouseNode.externalLink.treeId !== currentTree.treeId) {
            const success = await GlobalTreeService.addSpouseToRemoteNode(
              spouseNode.externalLink.treeId,
              spouseNode.externalLink.nodeId,
              personData.nodeId, // Link 'me' as spouse to 'them'
              currentUser?.email || 'unknown'
            );
            if (success) {
              changes.push(`Linked ${personData.name} as spouse to remote node ${spouseNode.name} in tree ${spouseNode.externalLink.treeName}`);
            } else {
              console.warn("Failed to update remote spouse link");
              // We still keep local link
            }
          }

          if (!spouseNode.spouseIds.includes(personData.nodeId)) {
            // Update local representation (whether real or shadow)
            spouseNode.spouseIds.push(personData.nodeId);
            touchNode(spouseId);
            changes.push(`Added spouse link between ${personData.name} and ${spouseNode.name} `);
          }
        }
      });

      userRemovedSpouses.forEach(spouseId => {
        updatedTree.nodes[personData.nodeId].spouseIds = updatedTree.nodes[personData.nodeId].spouseIds.filter(id => id !== spouseId);
        const spouseNode = updatedTree.nodes[spouseId];
        if (spouseNode) {
          spouseNode.spouseIds = spouseNode.spouseIds.filter(id => id !== personData.nodeId);
          touchNode(spouseId);
          changes.push(`Removed spouse link between ${personData.name} and ${spouseNode.name} `);
        }
      });

      newSiblingIds.forEach(sibId => {
        const sibNode = updatedTree.nodes[sibId];
        const parentId = personData.parentId;
        if (parentId && sibNode && sibNode.parentId !== parentId) {
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
          changes.push(`Linked sibling ${sibNode.name} to parent ${updatedTree.nodes[parentId].name} `);
        }
      });

      updatedTree.timestamp = getISTTimestamp();

      if (editorMode === 'add') {
        updatedTree.meta.nodeCount++;
        if (!updatedTree.rootNodeId) {
          updatedTree.rootNodeId = personData.nodeId;
        }
      }

      if (personData.nodeId === updatedTree.rootNodeId && personData.parentId) {
        let newRootId = personData.parentId;
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
        console.log(`Root node updated from ${personData.nodeId} to ${newRootId} `);
      }

      const summaryText = changes.join('; ');
      if (!summaryText && editorMode === 'edit') {
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

      if (!updatedTree.rootNodeId || !updatedTree.nodes[updatedTree.rootNodeId]) {
        console.warn('Invalid rootNodeId detected before save! Attempting to fix...');
        const nodeIds = Object.keys(updatedTree.nodes);
        if (nodeIds.length > 0) {
          const newRoot = Object.values(updatedTree.nodes).find(n => !n.parentId);
          if (newRoot) {
            updatedTree.rootNodeId = newRoot.nodeId;
          } else {
            updatedTree.rootNodeId = nodeIds[0];
          }
        } else {
          alert('Error: Tree has no nodes. Cannot save.');
          return;
        }
      }

      try {
        setLoading(true);
        const savedTree = await saveWithMerge(updatedTree, summaryText, [], Array.from(affectedIds));

        if (personData.email) {
          // Grant permission if new/edited person has an email
          // Grant access to the Tree File
          await grantWritePermission(currentTree.treeId, personData.email);
          // Grant access to the Lock File (for persistent locking)
          await grantLockFilePermission(currentTree.treeId, personData.email);
        }

        setTree(savedTree);
        setEditorMode(null);
        setEditingNodeId(null);

        if (lockId) await releaseLock(lockId);
        alert("Member saved successfully!");
      } catch (err) {
        console.error("Failed to save tree:", err);
        alert("Failed to save changes.");
      }
    });
  };



  const isAuthorized = currentUser && canEdit(currentUser.email);

  const handleDeleteMember = async (nodeId: string) => {
    // Delete logic

    if (!tree) return;
    if (!currentUser) {
      alert("You must be signed in to delete members.");
      return;
    }

    await executeWithLock(async (latestTree, _lockId) => {
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
        changes: `Deleted ${node.name} `,
        rootNodeName: updatedTree.nodes[updatedTree.rootNodeId]?.name || 'Unknown'
      });

      try {
        setLoading(true);
        const savedTree = await saveWithMerge(updatedTree, updatedTree.summary[0]?.changes || "Deleted member", [nodeId], []);

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


    if (!currentUser || !tree) return;

    await executeWithLock(async (latestTree, _lockId) => {
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
        alert(`Editor access ${newStatus ? 'granted to' : 'removed from'} ${targetNode.name} !`);
      } catch (err) {
        console.error("Failed to update editor status:", err);
        alert("Failed to save changes to Google Drive.");
      }
    });
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

  const handleViewHistory = (nodeId: string) => {
    setHistoryFilterNodeId(nodeId);
    setShowVersionHistory(true);
    setSelectedNodeId(null); // Close Person Detail
  };

  if (staticPage === 'privacy') {
    return <PrivacyPolicy />;
  }

  if (staticPage === 'terms') {
    return <TermsOfService />;
  }

  if (!isSignedIn) {
    return (
      <div className="app-container" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #e0f7fa 0%, #ffffff 100%)',
        height: '100vh',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'rgba(255, 255, 255, 0.8)',
          borderRadius: '20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          maxWidth: '400px',
          width: '90%'
        }}>
          <h1 style={{
            color: '#2c3e50',
            marginBottom: '10px',
            fontSize: '2.5rem',
            fontWeight: '700'
          }}>
            Family Tree
          </h1>
          <p style={{
            color: '#7f8c8d',
            marginBottom: '40px',
            fontSize: '1.1rem',
            lineHeight: '1.5'
          }}>
            Protect and preserve your family legacy across generations.
            <br />
            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Secure. Private. Forever.</span>
          </p>

          <button
            onClick={signIn}
            disabled={!isGapiReady}
            style={{
              padding: '12px 35px',
              fontSize: '1.1rem',
              backgroundColor: '#0984e3',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(9, 132, 227, 0.3)',
              transition: 'transform 0.2s',
              fontWeight: '600'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {isGapiReady ? 'Sign In with Google' : 'Loading...'}
          </button>

          <div style={{ marginTop: '30px', fontSize: '0.85rem', color: '#7f8c8d' }}>
            <a href="#privacy-policy" style={{ color: '#0984e3', textDecoration: 'none', margin: '0 10px' }}>Privacy Policy</a>
            |
            <a href="#terms-of-service" style={{ color: '#0984e3', textDecoration: 'none', margin: '0 10px' }}>Terms of Service</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>{currentTreeName && tree ? currentTreeName : (viewState === 'home' && currentUser ? t('dashboardTitle') : t('appTitle'))}</h1>
        < div className="auth-controls" >
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
                {/* Language Switcher */}
                <div className="menu-item">
                  <label>Language: </label>
                  <select
                    value={i18n.language}
                    onChange={(e) => i18n.changeLanguage(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="en">English</option>
                    <option value="kn">ಕನ್ನಡ (Kannada)</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                    <option value="ml">മലയാളം (Malayalam)</option>
                    <option value="hi">हिंदी (Hindi)</option>
                  </select>
                </div>
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
                      {t('menu.search')}
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        handleFindRelation("");
                        setIsMenuOpen(false);
                      }}
                    >
                      {t('menu.findRelation')}
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setShowIdentifyModal(true);
                        setIsMenuOpen(false);
                      }}
                    >
                      📷 Identify Member
                    </button>
                    {currentUser && (
                      <button
                        className="menu-item"
                        onClick={() => {
                          setShowCollaborators(true);
                          setIsMenuOpen(false);
                        }}
                      >
                        {t('menu.editors')}
                      </button>
                    )}
                    <button
                      className="menu-item"
                      onClick={() => {
                        setShowVersionHistory(true);
                        setIsMenuOpen(false);
                      }}
                    >
                      {t('menu.history')}
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
                      {t('menu.dashboard')}
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setViewState('home');
                        setTree(null);
                        setHomeAutoloadEnabled(false);
                        setIsMenuOpen(false);
                      }}
                    >
                      {t('menu.changeTree')}
                    </button>
                  </>
                )}

                <button
                  className="menu-item"
                  onClick={() => {
                    signOut();
                    setIsMenuOpen(false);
                  }}
                >
                  {t('menu.signOut')}
                </button>
              </div>
            )}
          </div>
        </div >
      </header >
      <main>
        {loading && <LoadingOverlay message={loadingMessage} />}
        {error && <div className="error">{error}</div>}

        {accessDenied && (
          <div className="access-denied-container" style={{ textAlign: 'center', marginTop: '50px' }}>
            <h2>Access Denied</h2>
            <p>Contact Narasimha Bhat @ +919902491986</p>
            <button
              className="menu-item"
              style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
              onClick={() => {
                signOut();
                setAccessDenied(false);
                setIsSignedIn(false);
                setCurrentUser(null);
              }}
            >
              Sign Out
            </button>
          </div>
        )}

        {tree && !error && !accessDenied && !showDashboard && (
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
              {!isSheetsMode && (
                <button
                  onClick={handleMigrateToStage2}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '15px',
                    border: '1px solid #ff9800',
                    background: '#fff3e0',
                    color: '#e65100',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                  title="Upgrade this tree to Stage 2 (Google Sheets)"
                >
                  🚀 Migrate to Stage 2
                </button>
              )}
            </div>
          </div>
        )}

        {!error && (
          <Suspense fallback={<LoadingOverlay message="Loading UI..." />}>
            {tree && !accessDenied && !showDashboard && viewState === 'tree' && (
              <>
                {treeViewType === 'standard' ? (
                  <div className="tree-container">
                    <TreeView
                      data={tree}
                      onNodeClick={handleNodeClick}
                      onNodeLongPress={handleNodeLongPress}
                      maxDepth={viewDepth}
                      showControls={!editorMode && !showFindRelation}
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
                {isAuthorized && (
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

            {/* Welcome Screen Removed */}

            {viewState === 'home' && currentUser && (
              <Home
                userEmail={currentUser.email}
                onSelectTree={async (treeId) => {
                  await loadTree(false, treeId);
                  setViewState('tree');
                }}
                currentTreeId={currentTreeId}
                isEditor={canEdit(currentUser?.email)}
                enableAutoload={homeAutoloadEnabled}
              />
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
                // Note: tree.treeName might be available in the tree object itself, but currentTreeName is state managed.
                // Using currentTreeName from App state is safer as it comes from filename/load logic.
                treeName={currentTreeName || tree.treeName || 'Family Tree'}
                onClose={handleManualClose}
                onSelectNode={(nodeId) => {
                  setShowVersionHistory(false);
                  setSelectedNodeId(nodeId);
                }}
                filterNodeId={historyFilterNodeId}
              />
            )}

            {showDashboard && tree && (
              <Dashboard
                tree={tree}
                onClose={() => setShowDashboard(false)}
                onNodeClick={(nodeId) => {
                  // Same drill down logic
                  setShowDashboard(false);
                  setViewState('tree');
                  setSelectedNodeId(nodeId);
                }}
              />
            )}

            {/* TreePicker removed */}

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
                onViewHistory={handleViewHistory}
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
          </Suspense>
        )}

        {loading && (
          <LoadingOverlay
            message={loadingMessage}
            onForceUnlock={async () => {
              // Logic to find current target file ID (replicated from executeWithLock logic, imperfect but sufficient)
              try {
                const files = await listTreeFiles();
                if (files && files.length > 0) {
                  let targetFileId = files[0].id;
                  if (currentTreeName) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const matching = files.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
                    if (matching.length > 0) targetFileId = matching[0].id;
                    else if (currentTreeId) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const current = files.find((f: any) => f.id === currentTreeId);
                      if (current) targetFileId = current.id;
                    }
                  }

                  if (targetFileId) {
                    // Let's import ensureLockFile/releaseLock from drive.ts (already imported).
                    const { releaseLock, ensureLockFile } = await import('./services/drive');
                    await releaseLock(await ensureLockFile(targetFileId!));
                    alert("Forced unlock. Please try again.");
                    setLoading(false); // Reset UI
                  }
                }
              } catch (e) {
                console.error("Force unlock failed", e);
                alert("Failed to force unlock.");
              }
            }}
          />
        )}
      </main>
      <Suspense fallback={<LoadingOverlay message="Loading Assistant..." />}>
        {tree && (
          <GeminiLive
            preferredVoice={(() => {
              if (!currentUser || !tree.nodes) return "Puck";
              const userNode = Object.values(tree.nodes).find(n => n.email && n.email.toLowerCase() === currentUser.email.toLowerCase());
              if (!userNode) return "Puck";
              return userNode.gender === 'male' ? "Aoede" : "Puck";
            })()}
            onAddPerson={async (data) => {
              console.log("Gemini requested Add:", data);
              if (!tree) return { success: false, message: "No family tree loaded." };
              if (!currentUser) return { success: false, message: "Please sign in to edit." };
              // Simple permission check
              if (!canEdit(currentUser.email)) return { success: false, message: "You do not have permission to edit this tree." };

              // Deduplication check
              const callKey = `add_${JSON.stringify(data)}`;
              const lastCall = recentToolCalls.current.get(callKey);
              if (lastCall && Date.now() - lastCall < 60000) {
                console.log("Deduplicating Gemini Add Person call:", data);
                return { success: true, message: "Deduplicated: This person was already added recently.", nodeId: "existing" };
              }
              recentToolCalls.current.set(callKey, Date.now());
              try {
                let resultMessage = "";
                // Define resultNodeId in the outer scope
                let resultNodeId: string | undefined;

                await executeWithLock(async (latestTree, _lockId) => {
                  if (!latestTree) throw new Error("Failed to load tree for locking.");

                  // Check for existing duplicates in the tree (deeper deduplication)
                  // 1. Check if child with same name exists under this parent
                  if (data.parentId && latestTree.nodes[data.parentId]) {
                    const parent = latestTree.nodes[data.parentId];
                    const existingChildId = parent.childrenIds.find(cid => {
                      const child = latestTree.nodes[cid];
                      return child && (
                        (child.name && child.name.toLowerCase() === data.name?.toLowerCase()) ||
                        (child.nameTranslations && Object.values(child.nameTranslations).some(t => t && t.toLowerCase() === data.name?.toLowerCase()))
                      );
                    });

                    if (existingChildId) {
                      console.log(`Duplicate detected: ${data.name} is already a child of ${parent.name}`);
                      resultMessage = `Deduplicated: ${data.name} already exists as a child of ${parent.name}.`;
                      resultNodeId = existingChildId;
                      return;
                    }
                  }

                  // 2. Check if spouse with same name exists
                  if (data.spouseIds && data.spouseIds.length > 0) {
                    // If adding a spouse, check if the current spouse already has a spouse with this name
                    const distinctSpouses = new Set(data.spouseIds);
                    let existingSpouseId: string | undefined;
                    distinctSpouses.forEach(id => {
                      const s = latestTree.nodes[id];
                      if (s && s.spouseIds) {
                        const found = s.spouseIds.find(sid => {
                          const sp = latestTree.nodes[sid];
                          return sp && (
                            (sp.name && sp.name.toLowerCase() === data.name?.toLowerCase())
                          );
                        });
                        if (found) existingSpouseId = found;
                      }
                    });

                    if (existingSpouseId) {
                      console.log(`Duplicate detected: ${data.name} is already a spouse.`);
                      resultMessage = `Deduplicated: ${data.name} already exists as a spouse.`;
                      resultNodeId = existingSpouseId;
                      return;
                    }
                  }

                  // Create new node
                  const newNodeId = uuidv4();
                  const now = getISTTimestamp();

                  // Generate Translations
                  let nameTranslations = {};
                  if (data.name) {
                    try {
                      nameTranslations = await generateAllTranslations(data.name);
                    } catch (err) {
                      console.warn("Failed to generate translations for new person", err);
                    }
                  }

                  const newNode: PersonNode = {
                    nodeId: newNodeId,
                    name: data.name || "Unknown",
                    gender: data.gender || null,
                    imageUrl: null,
                    phone: data.phone || null, phoneE164: null, email: data.email || null,
                    dob: data.dob || null, dobApprox: { known: false, year: null, month: null, day: null },
                    dod: data.dod || null,
                    dodApprox: { known: false, year: null, month: null, day: null }, dobInferred: false,
                    ageProvided: null,
                    address: { freeform: null },
                    location: data.location ? { ...data.location, zipcode: null } : null,
                    occupation: data.occupation || null,
                    education: data.education || [],
                    hobbies: data.hobbies || [],
                    spouseIds: [], childrenIds: [], parentId: null,
                    isEditor: false, editorSince: null,
                    editedBy: currentUser.email, editedTime: now,
                    externalLink: undefined,
                    nameTranslations: nameTranslations
                  };

                  // Linking
                  const changes: string[] = [`Added ${newNode.name}`];

                  // Parent Link
                  if (data.parentId && latestTree.nodes[data.parentId]) {
                    const parent = latestTree.nodes[data.parentId];
                    newNode.parentId = parent.nodeId;
                    if (!parent.childrenIds.includes(newNodeId)) {
                      parent.childrenIds.push(newNodeId);
                      parent.editedBy = currentUser.email;
                      parent.editedTime = now;
                      changes.push(`Linked as child of ${parent.name}`);
                    }
                  }

                  // Spouse Link
                  if (data.spouseIds && data.spouseIds.length > 0) {
                    data.spouseIds.forEach(spouseId => {
                      const spouse = latestTree.nodes[spouseId];
                      if (spouse) {
                        // Link new node to spouse
                        if (!newNode.spouseIds.includes(spouseId)) {
                          newNode.spouseIds.push(spouseId);
                        }
                        // Link spouse to new node
                        if (!spouse.spouseIds.includes(newNodeId)) {
                          spouse.spouseIds.push(newNodeId);
                          spouse.editedBy = currentUser.email;
                          spouse.editedTime = now;
                          changes.push(`Linked as spouse of ${spouse.name}`);
                        }
                      }
                    });
                  }

                  latestTree.nodes[newNodeId] = newNode;
                  latestTree.meta.nodeCount = Object.keys(latestTree.nodes).length;

                  const summary = changes.join(", ");
                  const affectedIds = [newNodeId];
                  if (data.parentId) affectedIds.push(data.parentId);
                  if (data.spouseIds) affectedIds.push(...data.spouseIds);

                  await saveWithMerge(latestTree, summary, [], affectedIds);
                  resultMessage = `Added ${newNode.name} (ID: ${newNode.nodeId}) successfully.`;
                  // Capture result
                  resultNodeId = newNodeId;
                });
                return { success: true, message: resultMessage, nodeId: resultNodeId };
              } catch (e) {
                console.error("Gemini Add Error", e);
                return { success: false, message: "Failed to add person: " + (e as Error).message };
              }
            }}
            onUpdatePerson={async (data) => {
              console.log("Gemini requested Update:", data);
              if (!tree) return { success: false, message: "No tree loaded." };
              if (!currentUser) return { success: false, message: "Please sign in." };
              if (!data.nodeId) return { success: false, message: "Node ID missing." };
              if (!canEdit(currentUser.email)) return { success: false, message: "Permission denied." };

              // Deduplication check
              const callKey = `update_${JSON.stringify(data)}`;
              const lastCall = recentToolCalls.current.get(callKey);
              if (lastCall && Date.now() - lastCall < 30000) {
                console.log("Deduplicating Gemini Update Person call:", data);
                return { success: true, message: "Deduplicated: This update was already applied recently." };
              }
              recentToolCalls.current.set(callKey, Date.now());
              try {
                let resultMessage = "";
                let resultNodeId: string | undefined;
                await executeWithLock(async (latestTree, _lockId) => {
                  if (!latestTree) throw new Error("Failed to load tree.");
                  const node = latestTree.nodes[data.nodeId!];
                  if (!node) throw new Error("Node not found.");

                  // Update fields
                  let changed = false;
                  const now = getISTTimestamp();

                  if (data.name) { node.name = data.name; changed = true; }
                  if (data.dob !== undefined) { node.dob = data.dob; changed = true; }
                  if (data.dod !== undefined) { node.dod = data.dod; changed = true; }
                  if (data.gender) { node.gender = data.gender; changed = true; }
                  if (data.email) { node.email = data.email; changed = true; }
                  if (data.phone !== undefined) { node.phone = data.phone; changed = true; }
                  if (data.location) {
                    // Merge or overwrite location
                    node.location = { ...node.location, ...data.location };
                    console.log("Updated location:", node.location);
                    changed = true;
                  }
                  if (data.occupation) { node.occupation = data.occupation; changed = true; }
                  if (data.education && data.education.length > 0) {
                    // Append new education entries
                    node.education = [...(node.education || []), ...data.education];
                    changed = true;
                  }
                  if (data.hobbies && data.hobbies.length > 0) {
                    // Merge hobbies (unique)
                    const existing = new Set(node.hobbies || []);
                    data.hobbies.forEach(h => existing.add(h));
                    node.hobbies = Array.from(existing);
                    changed = true;
                  }

                  // Handle Spouse Linking
                  if (data.spouseIds && data.spouseIds.length > 0) {
                    data.spouseIds.forEach(spouseId => {
                      const spouse = latestTree.nodes[spouseId];
                      if (spouse) {
                        if (!node.spouseIds.includes(spouseId)) {
                          node.spouseIds.push(spouseId);
                          changed = true;
                        }
                        if (!spouse.spouseIds.includes(node.nodeId)) {
                          spouse.spouseIds.push(node.nodeId);
                          spouse.editedBy = currentUser.email;
                          spouse.editedTime = now;
                          // Note: We are modifying 'spouse' node here which is part of latestTree.nodes, 
                          // so it will be saved. We can add a log for it too, or just consider it part of the update.
                        }
                      }
                    });
                  }

                  if (changed) {
                    node.editedBy = currentUser.email;
                    node.editedTime = now;

                    const affectedIds = [node.nodeId];
                    if (data.spouseIds) affectedIds.push(...data.spouseIds);

                    await saveWithMerge(latestTree, `Updated ${node.name}`, [], affectedIds);
                    resultMessage = `Updated ${node.name} (ID: ${node.nodeId}) successfully.`;
                    resultNodeId = node.nodeId;
                  } else {
                    resultMessage = "No changes detected.";
                  }
                });
                return { success: true, message: resultMessage, nodeId: resultNodeId };
              } catch (e) {
                console.error("Gemini Update Error", e);
                return { success: false, message: "Failed to update person: " + (e as Error).message };
              }
            }}
            onSearchNodes={searchNodesInSheets}
            onGetRecentNodes={getRecentNodesFromSheets}
          />
        )}
      </Suspense>

      {showIdentifyModal && tree && (
        <Suspense fallback={<LoadingOverlay message="Loading Camera..." />}>
          <IdentifyKin
            onClose={() => setShowIdentifyModal(false)}
            onIdentify={(nodeId) => {
              setViewState('tree');
              setEditingNodeId(null);
              setEditorMode(null);
              setSelectedNodeId(nodeId);
              setShowIdentifyModal(false);
            }}
            allNodes={tree.nodes}
          />
        </Suspense>
      )}
      {authError && (
        <div className="auth-error-overlay">
          <div className="auth-error-card">
            <h3>{t('Session Expired')}</h3>
            <p>{t('Your Google session has expired or requires re-authentication. Please sign in again to continue.')}</p>
            <button onClick={() => {
              setAuthError(null);
              signIn();
            }} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
              {t('Sign In with Google')}
            </button>
          </div>
        </div>
      )}
    </div>
  );


}

export default App;
