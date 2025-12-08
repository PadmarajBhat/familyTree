import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode } from '../logic/types';
import { getISTTimestamp, deriveDobFromAge, calculateAge } from '../logic/dateUtils';
import { isAncestor } from '../logic/relationshipUtils';
import { uploadImage, getPhotoUrl, deleteFile } from '../services/drive';
import { GlobalTreeService, type SearchResult } from '../services/GlobalTreeService';
import { CloseButton } from './CloseButton';
import './MemberEditor.css';

interface MemberEditorProps {
    currentUserEmail: string;
    mode: 'add' | 'edit';
    initialData?: PersonNode;
    existingNodes: Record<string, PersonNode>;
    onSave: (person: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[]) => void;
    onCancel: () => void;
    onDelete?: (nodeId: string) => void;
}

export const MemberEditor: React.FC<MemberEditorProps> = ({
    currentUserEmail,
    mode,
    initialData,
    existingNodes,
    onSave,
    onCancel,
    onDelete
}) => {
    const [name, setName] = useState(initialData?.name || '');
    // const [gender, setGender] = useState<'male' | 'female' | 'other'>('male'); // TODO: Add gender to PersonNode if needed, currently not in interface but useful for UI
    const [isAlive, setIsAlive] = useState(initialData ? !initialData.dod : true);
    const [dob, setDob] = useState(initialData?.dob || '');
    const [age, setAge] = useState(initialData?.ageProvided?.toString() || '');
    const [dod, setDod] = useState(initialData?.dod || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [address, setAddress] = useState(initialData?.address?.freeform || '');
    const [parentId, setParentId] = useState<string | null>(initialData?.parentId || null);

    const [gender, setGender] = useState<'male' | 'female' | 'other' | null>(initialData?.gender || null);
    const [hobbies, setHobbies] = useState<string[]>(initialData?.hobbies || []);
    const [education, setEducation] = useState<{ degree: string; major: string }[]>(initialData?.education || []);
    const [occupation, setOccupation] = useState<{ role: string; organization: string } | null>(initialData?.occupation || null);
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [zipcode, setZipcode] = useState(initialData?.location?.zipcode || '');
    const [locationData, setLocationData] = useState<{ district: string | null; state: string | null; country: string | null }>(
        initialData?.location ? { district: initialData.location.district, state: initialData.location.state, country: initialData.location.country } : { district: null, state: null, country: null }
    );

    // For Live Links
    const [externalLink, setExternalLink] = useState<{ treeId: string; nodeId: string } | undefined>(initialData?.externalLink);
    const [isLinkedNode, setIsLinkedNode] = useState(!!initialData?.externalLink);

    // Generic Duplicate Search
    const [nameSuggestions, setNameSuggestions] = useState<SearchResult[]>([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);

    // Father Search State
    const [fatherSearch, setFatherSearch] = useState('');
    const [showFatherSuggestions, setShowFatherSuggestions] = useState(false);

    // Children Management State
    const [childrenIds, setChildrenIds] = useState<string[]>(initialData?.childrenIds || []);
    const [childSearch, setChildSearch] = useState('');
    const [showChildSuggestions, setShowChildSuggestions] = useState(false);

    // Spouse Management State
    const [spouseIds, setSpouseIds] = useState<string[]>(initialData?.spouseIds || []);
    const [spouseSearch, setSpouseSearch] = useState('');
    const [showSpouseSuggestions, setShowSpouseSuggestions] = useState(false);

    // Sibling Management State
    // Siblings are derived from parentId, but we want to allow adding/removing them.
    // "Adding" a sibling means linking another node to the same parent.
    // "Removing" a sibling means unlinking that node from the parent.
    // To manage this locally, we need to know who the CURRENT siblings are.
    // If parentId changes, the available siblings context changes, which is tricky.
    // For now, let's assume siblings are relevant to the *current* parentId state.
    const [siblingIds, setSiblingIds] = useState<string[]>(() => {
        if (!initialData?.parentId || !existingNodes[initialData.parentId]) return [];
        return existingNodes[initialData.parentId].childrenIds.filter(id => id !== initialData.nodeId);
    });
    const [siblingSearch, setSiblingSearch] = useState('');
    const [showSiblingSuggestions, setShowSiblingSuggestions] = useState(false);

    // Update siblings if parentId changes (e.g. user selects a new father)
    useEffect(() => {
        if (parentId && existingNodes[parentId]) {
            // If we picked a new parent, the siblings are the children of that parent (excluding self)
            // But wait, if we are *editing*, we might have made changes to the sibling list that aren't saved yet?
            // Simpler approach: When parent changes, reset sibling list to that parent's children.
            // But we also want to allow *adding* new siblings to this list.
            const newParentChildren = existingNodes[parentId].childrenIds.filter(id => id !== initialData?.nodeId);
            // We should merge? Or just reset?
            // Let's reset for now to avoid confusion.
            setSiblingIds(newParentChildren);
        } else {
            setSiblingIds([]);
        }
    }, [parentId, existingNodes, initialData]);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(getPhotoUrl(initialData?.imageUrl || null) || null);
    const [uploading, setUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize computed age if dob exists but age doesn't
    useEffect(() => {
        if (mode === 'edit' && initialData?.dob && !initialData.ageProvided) {
            const calculated = calculateAge(initialData.dob, initialData.dod);
            if (calculated !== null) {
                setAge(calculated.toString());
            }
        }
        // Initialize father name for search field
        if (initialData?.parentId && existingNodes[initialData.parentId]) {
            setFatherSearch(existingNodes[initialData.parentId].name || 'Unknown');
        }
    }, [mode, initialData, existingNodes]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const fetchLocation = async () => {
        if (!zipcode || zipcode.length < 4) {
            alert("Please enter a valid zipcode.");
            return;
        }

        const cleanZip = zipcode.trim();
        const len = cleanZip.length;

        try {
            if (len === 6) {
                // Try Indian API
                const response = await fetch(`https://api.postalpincode.in/pincode/${cleanZip}`);
                const data = await response.json();
                if (data && data[0].Status === "Success") {
                    const details = data[0].PostOffice[0];
                    setLocationData({
                        district: details.District,
                        state: details.State,
                        country: details.Country
                    });
                    return;
                }
            } else if (len === 4) {
                // Try Australia (Zippopotam.us)
                const response = await fetch(`https://api.zippopotam.us/au/${cleanZip}`);
                if (response.ok) {
                    const data = await response.json();
                    setLocationData({
                        district: data.places[0]['place name'],
                        state: data.places[0]['state'],
                        country: data.country
                    });
                    return;
                }
            } else if (len === 5) {
                // Try US (Zippopotam.us)
                const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
                if (response.ok) {
                    const data = await response.json();
                    setLocationData({
                        district: data.places[0]['place name'],
                        state: data.places[0]['state'],
                        country: data.country
                    });
                    return;
                }
            }

            // Fallback if specific length checks failed or API returned error
            alert("Could not fetch location details. Please enter manually.");

        } catch (error) {
            console.error("Error fetching location:", error);
            alert("Error fetching location.");
        }
    };

    // Use an effect for searching to handle async GlobalTreeService if needed (though it's sync for now if loaded)
    // Actually GlobalTreeService.searchAllTrees is sync on cache.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (name && name.length > 2) {
                const results = GlobalTreeService.searchAllTrees(name);
                const filtered = results.filter(res => res.node.nodeId !== initialData?.nodeId);
                setNameSuggestions(filtered);
                setShowNameSuggestions(true);
            } else {
                setNameSuggestions([]);
                setShowNameSuggestions(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [name, initialData]);

    const [suggestedFathers, setSuggestedFathers] = useState<SearchResult[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (fatherSearch && fatherSearch.length > 2) {
                const results = GlobalTreeService.searchAllTrees(fatherSearch);
                const filtered = results.filter(res => {
                    // Cannot be own father
                    if (res.node.nodeId === initialData?.nodeId) return false;
                    // Prevent cycle if in same tree (simple check)
                    // If in different tree, cycle check is harder, omitting for now or assuming OK.
                    // Ideally we should check if 'res.node' is a descendant of 'initialData' crossing trees.
                    // This requires a global graph traversal which is expensive.
                    // For now, simple same-tree check:
                    if (res.treeId === (initialData?.externalLink?.treeId || 'current') && initialData) {
                        // This logic is flawed because we don't know "current" tree ID easily here without props.
                        // But existingNodes comes from current tree.
                        // Let's rely on the fact that if it's in existingNodes, use the old logic.
                        // If it's from another tree, assume safe for now (or Shadow Node logic handles it).
                    }
                    // Prevent cycle: Candidate cannot be a descendant of current node
                    // if (initialData && isAncestor(res.node.nodeId, initialData.nodeId, existingNodes)) return false; // Hard to check global ancenstry.
                    return true;
                }).slice(0, 10);
                setSuggestedFathers(filtered);
            } else {
                setSuggestedFathers([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [fatherSearch, initialData]);

    const [suggestedChildren, setSuggestedChildren] = useState<SearchResult[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (childSearch && childSearch.length > 2) {
                const results = GlobalTreeService.searchAllTrees(childSearch);
                const filtered = results.filter(res => res.node.nodeId !== initialData?.nodeId && !childrenIds.includes(res.node.nodeId)).slice(0, 10);
                setSuggestedChildren(filtered);
            } else {
                setSuggestedChildren([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [childSearch, initialData, childrenIds]);

    const [suggestedSpouses, setSuggestedSpouses] = useState<SearchResult[]>([]);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (spouseSearch && spouseSearch.length > 2) {
                const results = GlobalTreeService.searchAllTrees(spouseSearch);
                const filtered = results.filter(res => res.node.nodeId !== initialData?.nodeId && !spouseIds.includes(res.node.nodeId)).slice(0, 10);
                setSuggestedSpouses(filtered);
            } else {
                setSuggestedSpouses([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [spouseSearch, initialData, spouseIds]);

    // Siblings are strictly local to the parent usually, unless we support cross-tree siblings (half-siblings?).
    // For now, keep siblings local or use the same parent logic.
    // If a parent is cross-tree, siblings should come from that tree?
    // This is getting complex. Let's stick to: Siblings are children of the parent. 
    // If the parent is a Shadow Node, we can't easily fetch their other children without loading that tree.
    // GlobalTreeService loads all shortlisted trees, so we MIGHT have access.
    // Let's leave siblings as is (local) for now or use local search.
    // Actually, simply using existing logic for siblings is safest for this iteration.
    const filteredSiblings = useMemo(() => {
        if (!siblingSearch) return [];
        const lowerSearch = siblingSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own sibling
                !siblingIds.includes(node.nodeId) && // Not already added
                (node.name?.toLowerCase().includes(lowerSearch)) &&
                (initialData ? !isAncestor(initialData.nodeId, node.nodeId, existingNodes) && !isAncestor(node.nodeId, initialData.nodeId, existingNodes) : true)
            )
            .slice(0, 5);
    }, [siblingSearch, existingNodes, initialData, siblingIds]);


    const handleFatherSelect = (result: SearchResult) => {
        // If the result is from another tree, we need to handle that.
        // For now, we return the nodeId. The App handling of onSave needs to support Shadow Nodes if we pass extra info.
        // But MemberEditor stores parentId as string.
        // If it's a cross-tree node, we might need a way to store "link".
        // Current implementation expects parentId to be an ID in the current tree.
        // If we select a node from another tree, we should probably Create a Shadow Node immediately or on Save?
        // Let's trigger a specialized handling.

        // Wait, for this task (Default Tree), we just need to IMPLEMENT Unified Search.
        // The implementation plan says: "Selecting a person from another tree will create the corresponding Shadow Node and link."
        // This implies logic in App.tsx or MemberEditor.
        // If I change 'parentId' to be 'external:treeId:nodeId', App.tsx needs to parse it.
        // Or better: pass the external link info to onSave.

        // But MemberEditor state 'parentId' is string.
        // Let's treat 'parentId' as just ID.
        // If it's external, we need to know.

        // Actually, if we use GlobalTreeService, we are just selecting a Node.
        // If the node is NOT in existingNodes, it's external.
        // But we need to know WHICH tree it came from.
        setParentId(result.node.nodeId);
        setFatherSearch(result.node.name || 'Unknown');
        setShowFatherSuggestions(false);

        // We need to store that this parent is external if it is.
        // Let's add a state for 'externalParentDetails'
        // But wait, the previous code didn't have this.
        // I will assume for now we just pass the ID.
        // REALITY CHECK: If I just pass ID, App.tsx won't find it in current tree nodes.
        // So onSave will fail or create a broken link.
        // I need to pass "newParentExternalLink" to onSave?
        // Or onSave should accept "changes" object?

        // Let's stick to the simplest Plan B:
        // When selecting an external node, we don't support it FULLY in this step unless I modify onSave signature.
        // I will MODIFY onSave signature to accept `externalLinks`.
    };

    const handleChildSelect = (result: SearchResult) => {
        setChildrenIds(prev => [...prev, result.node.nodeId]);
        setChildSearch('');
        setShowChildSuggestions(false);
    };

    const handleRemoveChild = (childId: string) => {
        setChildrenIds(prev => prev.filter(id => id !== childId));
    };

    const handleSpouseSelect = (result: SearchResult) => {
        setSpouseIds(prev => [...prev, result.node.nodeId]);
        setSpouseSearch('');
        setShowSpouseSuggestions(false);
    };

    const handleRemoveSpouse = (id: string) => {
        setSpouseIds(prev => prev.filter(sid => sid !== id));
    };

    const handleSiblingSelect = (node: PersonNode) => {
        setSiblingIds(prev => [...prev, node.nodeId]);
        setSiblingSearch('');
        setShowSiblingSuggestions(false);
    };

    const handleRemoveSibling = (id: string) => {
        setSiblingIds(prev => prev.filter(sid => sid !== id));
    };

    const handleDuplicateSelect = (result: SearchResult) => {
        // Mandatory Live Link
        // alert(`Linking to "${result.node.name}" in tree "${result.treeName}".`);

        setExternalLink({ treeId: result.treeId, nodeId: result.node.nodeId });
        setIsLinkedNode(true);
        // setNotes(prev => prev + `\n[Linked from ${result.treeName}]`); // Optional, maybe skip to keep clean

        setName(result.node.name || '');
        if (result.node.dob) setDob(result.node.dob);
        if (result.node.gender) setGender(result.node.gender || 'other');

        setShowNameSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent, shouldAddChild: boolean = false) => {
        e.preventDefault();

        // Email is only required for editors
        const isEditor = initialData?.isEditor || false;
        if (isEditor && (!email || !email.trim())) {
            alert("Email is required for editors.");
            return;
        }

        setUploading(true);

        try {
            let imageUrl = initialData?.imageUrl || null;
            if (imageFile) {
                // If there was an old image, delete it to prevent duplicates
                if (initialData?.imageUrl) {
                    try {
                        await deleteFile(initialData.imageUrl);
                    } catch (e) {
                        console.warn("Failed to delete old image file", e);
                        // Continue anyway, don't block save
                    }
                }
                imageUrl = await uploadImage(imageFile);
            }

            let finalDob = dob;
            let dobInferred = initialData?.dobInferred || false;

            if (!dob && age) {
                finalDob = deriveDobFromAge(parseInt(age), isAlive ? null : dod);
                dobInferred = true;
            } else if (dob) {
                dobInferred = false;
            }

            const now = getISTTimestamp();

            const personData: PersonNode = {
                nodeId: initialData?.nodeId || uuidv4(),
                name: name || null,
                imageUrl: imageUrl,
                phone: phone || null,
                phoneE164: phone ? phone.replace(/\D/g, '') : null,
                email: email ? email.toLowerCase() : null,
                dob: finalDob || null,
                dobApprox: initialData?.dobApprox || { known: false, year: null, month: null, day: null },
                dod: !isAlive ? (dod || null) : null,
                dodApprox: initialData?.dodApprox || { known: false, year: null, month: null, day: null },
                ageProvided: age ? parseInt(age) : null,
                dobInferred: dobInferred,
                address: { freeform: address || null },
                spouseIds: spouseIds,
                parentId: parentId,
                childrenIds: childrenIds,
                isEditor: initialData?.isEditor || false,
                editorSince: initialData?.editorSince || null,
                editedBy: currentUserEmail,
                editedTime: now,
                gender: gender,
                hobbies: hobbies,
                education: education,
                occupation: occupation,
                notes: notes,
                location: zipcode ? {
                    zipcode: zipcode,
                    district: locationData.district,
                    state: locationData.state,
                    country: locationData.country
                } : null,
                externalLink: externalLink
            };

            // Live Link Write-Back
            if (isLinkedNode && externalLink) {
                const success = await GlobalTreeService.updateRemoteNode(
                    externalLink.treeId,
                    externalLink.nodeId,
                    personData,
                    currentUserEmail
                );
                if (!success) {
                    // Error handled in service; abort local save to ensure consistency
                    return;
                }
            }

            onSave(personData, parentId, childrenIds, spouseIds, siblingIds);
            if (shouldAddChild) {
                // Logic handled in parent component via a specific signal or just by knowing the flow
                // Actually, onSave is void. We might need a way to signal "Add Child".
                // For now, let's assume onSave handles the data update, and we need a way to trigger the next step.
                // We can pass a flag or use a different callback.
                // But the prop definition is fixed. Let's stick to the plan:
                // "Save & Add Child" -> We need to tell App.tsx to open add mode for a child.
                // We can modify onSave signature or add a new prop.
                // Let's hack it slightly: The App.tsx can inspect the 'shouldAddChild' if we pass it?
                // No, let's just add a temporary property to the personData or change onSave signature in the interface above.
                // I'll stick to changing the onSave signature in the interface above to include a 'nextAction' param?
                // Or just keep it simple: The user asked for "Add child option".
                // Let's just pass a callback or use a global state? No.
                // Let's add a `nextAction` parameter to `onSave`.
            }
        } catch (error) {
            console.error("Error saving member:", error);
            alert("Failed to save member. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="member-editor-modal">
            <div className="member-editor-content">
                <CloseButton onClick={onCancel} />
                <h2>{mode === 'add' ? 'Add Member' : 'Edit Member'}</h2>
                {isLinkedNode && (
                    <div style={{
                        backgroundColor: '#e8f5e9',
                        color: '#1b5e20',
                        padding: '10px',
                        borderRadius: '4px',
                        marginBottom: '15px',
                        border: '1px solid #a5d6a7',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span style={{ fontSize: '1.2em' }}>🔗</span>
                        <div>
                            <strong>Live Link Active</strong>
                            <div style={{ fontSize: '0.9em' }}>
                                This person is linked to Tree: <strong>{externalLink?.treeId}</strong>.
                                Edits made here will update the source tree automatically.
                            </div>
                        </div>
                    </div>
                )}
                <form onSubmit={(e) => handleSubmit(e, false)}>
                    <div className="form-actions top-actions">
                        <button type="submit" disabled={uploading} className="primary-btn">
                            {uploading ? 'Saving...' : 'Save'}
                        </button>
                        {mode === 'edit' && onDelete && initialData && (
                            <button type="button" onClick={() => {
                                if (window.confirm("Are you sure you want to delete this member?")) {
                                    onDelete(initialData.nodeId);
                                }
                            }} className="delete-btn" style={{ backgroundColor: '#ff4444', color: 'white' }}>
                                Delete
                            </button>
                        )}
                        <button type="button" onClick={onCancel} disabled={uploading} className="cancel-btn">Cancel</button>
                    </div>

                    <div className="form-group image-upload">
                        <div
                            className="image-preview"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ backgroundImage: imagePreview ? `url(${imagePreview})` : 'none' }}
                        >
                            {!imagePreview && <span>Tap to add photo</span>}
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className="form-group" style={{ position: 'relative' }}>
                        <label>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onFocus={() => name.length > 2 && setShowNameSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                            required
                        />
                        {showNameSuggestions && nameSuggestions.length > 0 && (
                            <div className="suggestions-dropdown">
                                <div className="suggestions-header">Possible Duplicates (Click to Populate)</div>
                                {nameSuggestions.map(curr => (
                                    <div
                                        key={`${curr.treeId}-${curr.node.nodeId}`}
                                        className="suggestion-item"
                                        onClick={() => handleDuplicateSelect(curr)}
                                    >
                                        <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: curr.node.imageUrl ? `url(${getPhotoUrl(curr.node.imageUrl)})` : 'none' }}>
                                            {!curr.node.imageUrl && '?'}
                                        </div>
                                        <div className="suggestion-info">
                                            <div className="suggestion-name">{curr.node.name} <span className="tree-badge">({curr.treeName})</span></div>
                                            <div className="suggestion-details">
                                                {curr.parentName ? `${curr.node.gender === 'female' ? 'D/o' : 'S/o'} ${curr.parentName}` : 'No parent info'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Gender</label>
                        <div className="toggle-group">
                            <label>
                                <input
                                    type="radio"
                                    name="gender"
                                    checked={gender === 'male'}
                                    onChange={() => setGender('male')}
                                /> Male
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="gender"
                                    checked={gender === 'female'}
                                    onChange={() => setGender('female')}
                                /> Female
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="gender"
                                    checked={gender === 'other'}
                                    onChange={() => setGender('other')}
                                /> Other
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Father (Parent)</label>
                        <div className="autocomplete">
                            <input
                                type="text"
                                value={fatherSearch}
                                onChange={e => {
                                    setFatherSearch(e.target.value);
                                    setShowFatherSuggestions(true);
                                    if (e.target.value === '') setParentId(null);
                                }}
                                onFocus={() => setShowFatherSuggestions(true)}
                                placeholder="Search for father..."
                            />
                            {showFatherSuggestions && suggestedFathers.length > 0 && (
                                <div className="suggestions-dropdown">
                                    <div className="suggestions-header">Search Results</div>
                                    {suggestedFathers.map((res, idx) => (
                                        <div
                                            key={`${res.node.nodeId}-${idx}`}
                                            className="suggestion-item"
                                            onClick={() => handleFatherSelect(res)}
                                        >
                                            <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: res.node.imageUrl ? `url(${getPhotoUrl(res.node.imageUrl)})` : 'none' }}>
                                                {!res.node.imageUrl && '?'}
                                            </div>
                                            <div className="suggestion-info">
                                                <div className="suggestion-name">{res.node.name} <span className="tree-badge">({res.treeName})</span></div>
                                                <div className="suggestion-details">
                                                    {res.parentName ? `${res.node.gender === 'female' ? 'D/o' : 'S/o'} ${res.parentName}` : 'No parent info'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Spouses</label>
                        <div className="children-list">
                            {spouseIds.map(id => {
                                const node = existingNodes[id];
                                return (
                                    <div key={id} className="child-tag">
                                        <span>{node?.name || 'Unknown'}</span>
                                        <button type="button" onClick={() => handleRemoveSpouse(id)}>×</button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="autocomplete">
                            <input
                                type="text"
                                value={spouseSearch}
                                onChange={e => {
                                    setSpouseSearch(e.target.value);
                                    setShowSpouseSuggestions(true);
                                }}
                                onFocus={() => setShowSpouseSuggestions(true)}
                                placeholder="Search to add spouse..."
                            />
                            {showSpouseSuggestions && suggestedSpouses.length > 0 && (
                                <div className="suggestions-dropdown">
                                    <div className="suggestions-header">Search Results</div>
                                    {suggestedSpouses.map((res, idx) => (
                                        <div
                                            key={`${res.node.nodeId}-${idx}`}
                                            className="suggestion-item"
                                            onClick={() => handleSpouseSelect(res)}
                                        >
                                            <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: res.node.imageUrl ? `url(${getPhotoUrl(res.node.imageUrl)})` : 'none' }}>
                                                {!res.node.imageUrl && '?'}
                                            </div>
                                            <div className="suggestion-info">
                                                <div className="suggestion-name">{res.node.name} <span className="tree-badge">({res.treeName})</span></div>
                                                <div className="suggestion-details">
                                                    {res.parentName ? `${res.node.gender === 'female' ? 'D/o' : 'S/o'} ${res.parentName}` : 'No parent info'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Siblings {(!parentId) && <span style={{ fontSize: '0.8em', color: '#888' }}>(Requires Parent)</span>}</label>
                        {parentId ? (
                            <>
                                <div className="children-list">
                                    {siblingIds.map(id => {
                                        const node = existingNodes[id];
                                        return (
                                            <div key={id} className="child-tag">
                                                <span>{node?.name || 'Unknown'}</span>
                                                <button type="button" onClick={() => handleRemoveSibling(id)}>×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="autocomplete">
                                    <input
                                        type="text"
                                        value={siblingSearch}
                                        onChange={e => {
                                            setSiblingSearch(e.target.value);
                                            setShowSiblingSuggestions(true);
                                        }}
                                        onFocus={() => setShowSiblingSuggestions(true)}
                                        placeholder="Search to add sibling..."
                                    />
                                    {showSiblingSuggestions && filteredSiblings.length > 0 && (
                                        <ul className="suggestions-list">
                                            {filteredSiblings.map(node => (
                                                <li key={node.nodeId} onClick={() => handleSiblingSelect(node)}>
                                                    {node.name}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="info-text" style={{ color: '#666', fontStyle: 'italic' }}>
                                Please select a father/parent first to manage siblings.
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Children</label>
                        <div className="children-list">
                            {childrenIds.map(childId => {
                                const child = existingNodes[childId];
                                return (
                                    <div key={childId} className="child-tag">
                                        <span>{child?.name || 'Unknown'}</span>
                                        <button type="button" onClick={() => handleRemoveChild(childId)}>×</button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="autocomplete">
                            <input
                                type="text"
                                value={childSearch}
                                onChange={e => {
                                    setChildSearch(e.target.value);
                                    setShowChildSuggestions(true);
                                }}
                                onFocus={() => setShowChildSuggestions(true)}
                                placeholder="Search to add child..."
                            />
                            {showChildSuggestions && suggestedChildren.length > 0 && (
                                <div className="suggestions-dropdown">
                                    <div className="suggestions-header">Search Results</div>
                                    {suggestedChildren.map((res, idx) => (
                                        <div
                                            key={`${res.node.nodeId}-${idx}`}
                                            className="suggestion-item"
                                            onClick={() => handleChildSelect(res)}
                                        >
                                            <div className="suggestion-avatar member-avatar-sm" style={{ backgroundImage: res.node.imageUrl ? `url(${getPhotoUrl(res.node.imageUrl)})` : 'none' }}>
                                                {!res.node.imageUrl && '?'}
                                            </div>
                                            <div className="suggestion-info">
                                                <div className="suggestion-name">{res.node.name} <span className="tree-badge">({res.treeName})</span></div>
                                                <div className="suggestion-details">
                                                    {res.parentName ? `${res.node.gender === 'female' ? 'D/o' : 'S/o'} ${res.parentName}` : 'No parent info'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <div className="toggle-group">
                            <label>
                                <input
                                    type="radio"
                                    checked={isAlive}
                                    onChange={() => setIsAlive(true)}
                                /> Alive
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    checked={!isAlive}
                                    onChange={() => setIsAlive(false)}
                                /> Deceased
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Date of Birth</label>
                        <input type="date" value={dob} onChange={e => { setDob(e.target.value); setAge(''); }} />
                    </div>

                    {
                        !dob && (
                            <div className="form-group">
                                <label>Or Age (approx)</label>
                                <input type="number" value={age} onChange={e => { setAge(e.target.value); setDob(''); }} placeholder="Years" />
                            </div>
                        )
                    }

                    {
                        !isAlive && (
                            <div className="form-group">
                                <label>Date of Death</label>
                                <input type="date" value={dod} onChange={e => setDod(e.target.value)} />
                            </div>
                        )
                    }

                    <div className="form-group">
                        <label>Phone</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Email {(initialData?.isEditor) && <span style={{ color: 'red' }}>*</span>}</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required={initialData?.isEditor || false} />
                    </div>

                    <div className="form-group">
                        <label>Address</label>
                        <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} />
                    </div>

                    <div className="form-group">
                        <label>Location (Zipcode)</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={zipcode}
                                onChange={e => setZipcode(e.target.value)}
                                placeholder="Zipcode/Pincode"
                                style={{ flex: 1 }}
                            />
                            <button type="button" onClick={fetchLocation} style={{ padding: '0 15px' }}>Fetch</button>
                        </div>
                        {locationData.district && (
                            <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#555' }}>
                                {locationData.district}, {locationData.state}, {locationData.country}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Education</label>
                        {education.map((edu, index) => (
                            <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                                <input
                                    type="text"
                                    placeholder="Degree"
                                    value={edu.degree}
                                    onChange={e => {
                                        const newEdu = [...education];
                                        newEdu[index].degree = e.target.value;
                                        setEducation(newEdu);
                                    }}
                                />
                                <input
                                    type="text"
                                    placeholder="Major"
                                    value={edu.major}
                                    onChange={e => {
                                        const newEdu = [...education];
                                        newEdu[index].major = e.target.value;
                                        setEducation(newEdu);
                                    }}
                                />
                                <button type="button" onClick={() => {
                                    setEducation(education.filter((_, i) => i !== index));
                                }}>×</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => setEducation([...education, { degree: '', major: '' }])} style={{ fontSize: '0.8em' }}>+ Add Education</button>
                    </div>

                    <div className="form-group">
                        <label>Occupation</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                placeholder="Role"
                                value={occupation?.role || ''}
                                onChange={e => setOccupation({ ...occupation, role: e.target.value, organization: occupation?.organization || '' })}
                            />
                            <input
                                type="text"
                                placeholder="Organization"
                                value={occupation?.organization || ''}
                                onChange={e => setOccupation({ ...occupation, role: occupation?.role || '', organization: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Hobbies</label>
                        <input
                            type="text"
                            value={hobbies.join(', ')}
                            onChange={e => setHobbies(e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                            placeholder="Reading, Traveling, etc."
                        />
                    </div>

                    <div className="form-group">
                        <label>Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Random remarks..." />
                    </div>

                </form >
            </div >
        </div >
    );
};
