import React, { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode } from '../logic/types';
import { getISTTimestamp, deriveDobFromAge, calculateAge } from '../logic/dateUtils';
import { isAncestor } from '../logic/relationshipUtils';
import { uploadImage } from '../services/drive';
import { CloseButton } from './CloseButton';
import './MemberEditor.css';

interface MemberEditorProps {
    currentUserEmail: string;
    mode: 'add' | 'edit';
    initialData?: PersonNode;
    existingNodes: Record<string, PersonNode>;
    onSave: (person: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[]) => void;
    onCancel: () => void;
}

export const MemberEditor: React.FC<MemberEditorProps> = ({
    currentUserEmail,
    mode,
    initialData,
    existingNodes,
    onSave,
    onCancel
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
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.imageUrl || null);
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

    const filteredFathers = useMemo(() => {
        if (!fatherSearch) return [];
        const lowerSearch = fatherSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own father
                (node.name?.toLowerCase().includes(lowerSearch)) &&
                // Prevent cycle: Candidate cannot be a descendant of current node
                // If we are editing an existing node, check if candidate is descendant
                (initialData ? !isAncestor(node.nodeId, initialData.nodeId, existingNodes) : true)
            )
            .slice(0, 5); // Limit suggestions
    }, [fatherSearch, existingNodes, initialData]);

    const filteredChildren = useMemo(() => {
        if (!childSearch) return [];
        const lowerSearch = childSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own child
                !childrenIds.includes(node.nodeId) && // Not already added
                (node.name?.toLowerCase().includes(lowerSearch)) &&
                // Prevent cycle: Candidate cannot be an ancestor of current node
                (initialData ? !isAncestor(initialData.nodeId, node.nodeId, existingNodes) : true)
            )
            .slice(0, 5);
    }, [childSearch, existingNodes, initialData, childrenIds]);

    const filteredSpouses = useMemo(() => {
        if (!spouseSearch) return [];
        const lowerSearch = spouseSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own spouse
                !spouseIds.includes(node.nodeId) && // Not already added
                (node.name?.toLowerCase().includes(lowerSearch)) &&
                // Prevent cycle/weirdness: Spouse shouldn't be a direct ancestor/descendant?
                // Technically possible in some trees but usually an error. Let's allow for now but maybe warn?
                // Let's stick to basic filtering.
                true
            )
            .slice(0, 5);
    }, [spouseSearch, existingNodes, initialData, spouseIds]);

    const filteredSiblings = useMemo(() => {
        if (!siblingSearch) return [];
        const lowerSearch = siblingSearch.toLowerCase();
        return Object.values(existingNodes)
            .filter(node =>
                node.nodeId !== initialData?.nodeId && // Cannot be own sibling
                !siblingIds.includes(node.nodeId) && // Not already added
                (node.name?.toLowerCase().includes(lowerSearch)) &&
                // Sibling candidates should probably not be ancestors/descendants either?
                // If A is sibling of B, they share a parent.
                // If B is child of A, B cannot be sibling of A.
                (initialData ? !isAncestor(initialData.nodeId, node.nodeId, existingNodes) && !isAncestor(node.nodeId, initialData.nodeId, existingNodes) : true)
            )
            .slice(0, 5);
    }, [siblingSearch, existingNodes, initialData, siblingIds]);

    const handleFatherSelect = (node: PersonNode) => {
        setParentId(node.nodeId);
        setFatherSearch(node.name || 'Unknown');
        setShowFatherSuggestions(false);
    };

    const handleChildSelect = (node: PersonNode) => {
        setChildrenIds(prev => [...prev, node.nodeId]);
        setChildSearch('');
        setShowChildSuggestions(false);
    };

    const handleRemoveChild = (childId: string) => {
        setChildrenIds(prev => prev.filter(id => id !== childId));
    };

    const handleSpouseSelect = (node: PersonNode) => {
        setSpouseIds(prev => [...prev, node.nodeId]);
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
                spouseIds: initialData?.spouseIds || [],
                parentId: parentId, // Updated parent ID
                childrenIds: initialData?.childrenIds || [],
                isEditor: initialData?.isEditor || false,
                editorSince: initialData?.editorSince || null,
                editedBy: currentUserEmail,
                editedTime: now,
            };

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
                <form onSubmit={(e) => handleSubmit(e, false)}>
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

                    <div className="form-group">
                        <label>Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required />
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
                            {showFatherSuggestions && filteredFathers.length > 0 && (
                                <ul className="suggestions-list">
                                    {filteredFathers.map(node => (
                                        <li key={node.nodeId} onClick={() => handleFatherSelect(node)}>
                                            {node.name}
                                        </li>
                                    ))}
                                </ul>
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
                            {showSpouseSuggestions && filteredSpouses.length > 0 && (
                                <ul className="suggestions-list">
                                    {filteredSpouses.map(node => (
                                        <li key={node.nodeId} onClick={() => handleSpouseSelect(node)}>
                                            {node.name}
                                        </li>
                                    ))}
                                </ul>
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
                            {showChildSuggestions && filteredChildren.length > 0 && (
                                <ul className="suggestions-list">
                                    {filteredChildren.map(node => (
                                        <li key={node.nodeId} onClick={() => handleChildSelect(node)}>
                                            {node.name}
                                        </li>
                                    ))}
                                </ul>
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

                    <div className="form-actions">
                        <button type="button" onClick={onCancel} disabled={uploading}>Cancel</button>
                        {/* <button type="button" onClick={(e) => handleSubmit(e as any, true)} disabled={uploading} className="secondary-action">
                            Save & Add Child
                        </button> */}
                        {/* Commented out Save & Add Child for now as it requires more complex state management in App.tsx 
                            and the user request was primarily about "Add father and add child option" which usually means linking.
                            I will focus on the linking part first as per the "Children" section added above.
                        */}
                        <button type="submit" disabled={uploading}>
                            {uploading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form >
            </div >
        </div >
    );
};
