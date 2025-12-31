import React, { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode } from '../../logic/types';
import { getISTTimestamp, parseDateFromDDMMYYYY, formatDateToDDMMYYYY } from '../../logic/dateUtils';
import { isAncestor } from '../../logic/relationshipUtils';
import { uploadImage, uploadVideo, deleteFile, getPhotoUrl } from '../../services/drive';
import { GlobalTreeService, type SearchResult } from '../../services/GlobalTreeService';
import { CloseButton } from '../CloseButton';
import './MemberEditor.css';

// Hooks
import { useMemberForm } from './hooks/useMemberForm';
import { useMediaCapture } from './hooks/useMediaCapture';
import { useLocationSearch } from './hooks/useLocationSearch';
import { usePeopleSearch } from './hooks/usePeopleSearch';

// Components
import { MediaSection } from './components/MediaSection';
import { BasicInfoSection } from './components/BasicInfoSection';
import { RelationSelect } from './components/RelationSelect';
import { LocationSection } from './components/LocationSection';

interface MemberEditorProps {
    currentUserEmail: string;
    mode: 'add' | 'edit';
    initialData?: PersonNode;
    existingNodes: Record<string, PersonNode>;
    onSave: (person: PersonNode, newParentId: string | null, newChildrenIds: string[], newSpouseIds: string[], newSiblingIds: string[], shadowNodes?: PersonNode[]) => void;
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
    // 1. Core Form Data
    const form = useMemberForm({ initialData, mode, existingNodes });

    // 2. Media Capture
    const media = useMediaCapture({
        initialImageUrl: initialData?.imageUrl,
        initialVideoUrl: initialData?.videoUrl
    });
    const [uploading, setUploading] = useState(false);
    const cameraInputRef = React.useRef<HTMLInputElement>(null);
    const imageInputRef = React.useRef<HTMLInputElement>(null);

    // 3. Location Search
    const location = useLocationSearch({
        initialLocation: initialData?.location,
        disabled: !!initialData?.externalLink
    });

    // 4. Live Link / Shadow Node State
    const [externalLink, setExternalLink] = useState<{ treeId: string; nodeId: string; treeName?: string } | undefined>(initialData?.externalLink);
    const [isLinkedNode, setIsLinkedNode] = useState(!!initialData?.externalLink);
    const [linkedImageUrl, setLinkedImageUrl] = useState<string | null>(null);
    const [pendingShadowNodes, setPendingShadowNodes] = useState<PersonNode[]>([]);

    const createShadowNode = (result: SearchResult): PersonNode => ({
        nodeId: result.node.nodeId,
        name: result.node.name,
        imageUrl: result.node.imageUrl,
        gender: result.node.gender,
        dob: result.node.dob,
        dobApprox: result.node.dobApprox || { known: false, year: null, month: null, day: null },
        dod: result.node.dod,
        dodApprox: result.node.dodApprox || { known: false, year: null, month: null, day: null },
        dobInferred: false,
        ageProvided: null,
        phone: null,
        phoneE164: null,
        email: null,
        address: { freeform: null }, // Don't verify address for shadow nodes
        spouseIds: [],
        parentId: null,
        childrenIds: [],
        isEditor: false,
        editorSince: null,
        editedBy: null,
        editedTime: null,
        externalLink: {
            treeId: result.treeId,
            nodeId: result.node.nodeId,
            treeName: result.treeName
        }
    });

    // 5. Relations Search Logic
    // Helper to filter out self, ancestors/descendants if needed (basic cycle check)
    const filterRelation = (res: SearchResult) => {
        if (res.node.nodeId === initialData?.nodeId) return false;
        // Basic cycle prevention: if we know "current" node, prevent picking it.
        // Deep ancestry check is expensive and complex across trees.
        return true;
    };

    // Father Search
    const fatherSearch = usePeopleSearch({
        initialValue: initialData?.parentId ? (existingNodes[initialData.parentId]?.name || 'Unknown') : '',
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Spouse Search
    const spouseSearch = usePeopleSearch({
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Child Search
    const childSearch = usePeopleSearch({
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Sibling Search
    // Siblings are local filtering usually

    const [siblingSearchText, setSiblingSearchText] = useState('');
    const siblingSuggestions = useMemo(() => {
        if (!siblingSearchText || siblingSearchText.length < 2) return [];
        const lower = siblingSearchText.toLowerCase();
        return Object.values(existingNodes)
            .filter(n =>
                n.nodeId !== initialData?.nodeId &&
                !form.siblingIds.includes(n.nodeId) &&
                n.name?.toLowerCase().includes(lower) &&
                (initialData ? !isAncestor(initialData.nodeId, n.nodeId, existingNodes) && !isAncestor(n.nodeId, initialData.nodeId, existingNodes) : true)
            )
            .slice(0, 5)
            .map(n => ({
                treeId: 'current',
                treeName: 'Current Tree',
                node: n,
                parentName: n.parentId ? existingNodes[n.parentId]?.name : undefined
            } as SearchResult));
    }, [siblingSearchText, existingNodes, initialData, form.siblingIds]);


    // Relation Handlers
    const handleFatherSelect = (result: SearchResult) => {
        form.setParentId(result.node.nodeId);
        fatherSearch.setSearchText(result.node.name || 'Unknown');
        fatherSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleSpouseSelect = (result: SearchResult) => {
        form.setSpouseIds(prev => [...prev, result.node.nodeId]);
        spouseSearch.setSearchText('');
        spouseSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleChildSelect = (result: SearchResult) => {
        form.setChildrenIds(prev => [...prev, result.node.nodeId]);
        childSearch.setSearchText('');
        childSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleSiblingSelect = (result: SearchResult) => {
        form.setSiblingIds(prev => [...prev, result.node.nodeId]);
        setSiblingSearchText('');
    };

    // Duplicate/Live Link Selection
    const nameDuplicateSearch = usePeopleSearch({
        initialValue: '', // We don't start with a search, it's triggered by name hook manually usually?
        // Actually, BasicInfoSection triggers it via `name` prop changes + usePeopleSearch effect?
        // Let's reuse usePeopleSearch but driven by `form.name`.
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => res.node.nodeId !== initialData?.nodeId),
        disabled: isLinkedNode
    });

    // Wire up `nameDuplicateSearch` to `form.name`
    useEffect(() => {
        nameDuplicateSearch.setSearchText(form.name);
    }, [form.name]);

    const handleDuplicateSelect = (result: SearchResult) => {
        setExternalLink({ treeId: result.treeId, nodeId: result.node.nodeId, treeName: result.treeName });
        setIsLinkedNode(true);
        if (result.node.imageUrl) {
            setLinkedImageUrl(result.node.imageUrl);
            media.setImagePreview(getPhotoUrl(result.node.imageUrl));
        }

        form.setName(result.node.name || '');
        if (result.node.dob) {
            form.setDob(result.node.dob);
            form.setDobInput(formatDateToDDMMYYYY(result.node.dob));
        }
        if (result.node.gender) form.setGender(result.node.gender || 'other');

        nameDuplicateSearch.setShowSuggestions(false);
    };

    const getNodeName = (id: string) => {
        const node = existingNodes[id] || pendingShadowNodes.find(n => n.nodeId === id);
        return node?.name || 'Unknown';
    };

    // SAVE HANDLER
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            const validation = form.validate();
            if (!validation.valid) {
                alert(validation.errors.join('\n'));
                setUploading(false);
                return;
            }

            // Media Uploads
            let finalImageUrl = initialData?.imageUrl || null;
            if (linkedImageUrl) finalImageUrl = linkedImageUrl;
            if (media.imageFile) {
                if (initialData?.imageUrl) {
                    try { await deleteFile(initialData.imageUrl); } catch (e) { console.warn("Delete old image failed", e); }
                }
                finalImageUrl = await uploadImage(media.imageFile);
            }

            let finalVideoUrl = initialData?.videoUrl || null;
            if (media.videoBlob) {
                if (initialData?.videoUrl) {
                    try { await deleteFile(initialData.videoUrl); } catch (e) { console.warn("Delete old video failed", e); }
                }
                finalVideoUrl = await uploadVideo(media.videoBlob, `video_${initialData?.nodeId || 'new'}.webm`);
            }

            const now = getISTTimestamp();
            const personData: PersonNode = {
                nodeId: initialData?.nodeId || uuidv4(),
                name: form.name || null,
                imageUrl: finalImageUrl,
                videoUrl: finalVideoUrl,
                phone: form.phone || null,
                phoneE164: form.phone ? form.phone.replace(/\D/g, '') : null,
                email: form.email ? form.email.toLowerCase() : null,
                dob: validation.finalDob || null,
                dobApprox: initialData?.dobApprox || { known: false, year: null, month: null, day: null },
                dod: !form.isAlive ? (form.dod || null) : null,
                dodApprox: initialData?.dodApprox || { known: false, year: null, month: null, day: null },
                ageProvided: form.age ? parseInt(form.age) : null,
                dobInferred: validation.dobInferred,
                address: { freeform: form.address || null },
                spouseIds: form.spouseIds,
                parentId: form.parentId,
                childrenIds: form.childrenIds,
                isEditor: initialData?.isEditor || false,
                editorSince: initialData?.editorSince || null,
                editedBy: currentUserEmail,
                editedTime: now,
                gender: form.gender,
                hobbies: form.hobbies,
                education: form.education,
                occupation: form.occupation,
                notes: form.notes,
                location: location.zipcode ? {
                    zipcode: location.zipcode,
                    district: location.locationData.district,
                    state: location.locationData.state,
                    country: location.locationData.country
                } : null,
                externalLink: externalLink,
                nameTranslations: form.translations
            };

            // Live Link Write-Back
            if (isLinkedNode && externalLink) {
                const success = await GlobalTreeService.updateRemoteNode(
                    externalLink.treeId,
                    externalLink.nodeId,
                    personData,
                    currentUserEmail
                );
                if (!success) return; // Error handled in service
            }

            onSave(personData, form.parentId, form.childrenIds, form.spouseIds, form.siblingIds, pendingShadowNodes);

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

                {isLinkedNode && externalLink && (
                    <div className="live-link-banner" style={{ background: '#e3f2fd', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #2196f3' }}>
                        <strong>Live Link Active:</strong> This person is linked to tree "{externalLink.treeName || externalLink.treeId}".
                        <br />
                        <small>Profile details are read-only. You can only edit relationships (Spouse/Children) in this tree.</small>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-actions top-actions">
                        <button type="button" onClick={onCancel} disabled={uploading} className="cancel-btn">Cancel</button>
                        <div className="right-actions">
                            {mode === 'edit' && onDelete && initialData && (form.childrenIds.length === 0 && form.spouseIds.length === 0) && (
                                <button type="button" onClick={() => {
                                    if (window.confirm("Are you sure you want to delete this member?")) onDelete(initialData.nodeId);
                                }} className="delete-btn">Delete</button>
                            )}
                            <button type="submit" disabled={uploading} className="primary-btn">{uploading ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>

                    {/* Media */}
                    <MediaSection
                        imagePreview={media.imagePreview}
                        onImageChange={media.handleImageChange}
                        imageInputRef={imageInputRef}
                        cameraInputRef={cameraInputRef}
                        isRecording={media.isRecording}
                        videoPreview={media.videoPreview}
                        recordingTime={media.recordingTime}
                        videoRef={media.videoRef}
                        playbackRef={media.playbackRef}
                        onStartRecording={media.startRecording}
                        onStopRecording={media.stopRecording}
                        onRetakeRecording={media.startRecording}
                        onClearVideo={() => { media.setVideoPreview(null); media.setVideoBlob(null); }}
                        onCaptureFrame={media.captureFrameFromVideo}
                    />

                    {/* Basic Info */}
                    <BasicInfoSection
                        name={form.name}
                        setName={form.setName}
                        onNameBlur={form.handleNameBlur}
                        onNameFocus={() => !isLinkedNode && form.name.length > 2 && nameDuplicateSearch.setShowSuggestions(true)}
                        translations={form.translations}
                        setTranslations={form.setTranslations}
                        gender={form.gender}
                        setGender={form.setGender}
                        nameSuggestions={nameDuplicateSearch.suggestions}
                        showNameSuggestions={nameDuplicateSearch.showSuggestions}
                        onDuplicateSelect={handleDuplicateSelect}
                        disabled={isLinkedNode}
                    />

                    {/* 3. Phone */}
                    <div className="form-group">
                        <label>Phone</label>
                        <input type="tel" value={form.phone} onChange={e => form.setPhone(e.target.value)} disabled={isLinkedNode} />
                    </div>

                    {/* 4. Father */}
                    <RelationSelect
                        label="Father (Parent)"
                        searchText={fatherSearch.searchText}
                        onSearchChange={(val) => { fatherSearch.setSearchText(val); if (!val) form.setParentId(null); }}
                        suggestions={fatherSearch.suggestions}
                        showSuggestions={fatherSearch.showSuggestions}
                        onSelect={handleFatherSelect}
                        searchPlaceholder="Search for father..."
                        disabled={isLinkedNode}
                    />

                    {/* 5. Spouses */}
                    <RelationSelect
                        label="Spouses"
                        items={form.spouseIds.map(id => ({ id, name: getNodeName(id) }))}
                        searchText={spouseSearch.searchText}
                        onSearchChange={spouseSearch.setSearchText}
                        suggestions={spouseSearch.suggestions}
                        showSuggestions={spouseSearch.showSuggestions}
                        onSelect={handleSpouseSelect}
                        onRemove={(id) => form.setSpouseIds(prev => prev.filter(sid => sid !== id))}
                        searchPlaceholder="Search to add spouse..."
                        disabled={isLinkedNode}
                    />

                    {/* Location */}
                    <LocationSection
                        searchText={location.searchText}
                        setSearchText={location.setSearchText}
                        onFocus={() => location.searchText.length > 2 && location.setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => location.setShowSuggestions(false), 200)}
                        suggestions={location.suggestions}
                        showSuggestions={location.showSuggestions}
                        onSelect={location.handleSelect}
                        locationData={location.locationData}
                        zipcode={location.zipcode}
                        disabled={isLinkedNode}
                    />

                    {/* Status & Dates */}
                    <div className="form-group">
                        <label>Status</label>
                        <div className="toggle-group">
                            <label><input type="radio" checked={form.isAlive} onChange={() => form.setIsAlive(true)} disabled={isLinkedNode} /> Alive</label>
                            <label><input type="radio" checked={!form.isAlive} onChange={() => form.setIsAlive(false)} disabled={isLinkedNode} /> Deceased</label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Date of Birth (DD-MM-YYYY)</label>
                        <input
                            type="text"
                            value={form.dobInput}
                            placeholder="DD-MM-YYYY"
                            inputMode="numeric"
                            onChange={e => {
                                form.setDobInput(e.target.value);
                                const parsed = parseDateFromDDMMYYYY(e.target.value);
                                if (parsed) form.setDob(parsed);
                                else if (!e.target.value) form.setDob('');
                            }}
                            disabled={isLinkedNode}
                        />
                    </div>
                    {!form.dob && (
                        <div className="form-group">
                            <label>Or Age (approx)</label>
                            <input type="number" value={form.age} onChange={e => { form.setAge(e.target.value); form.setDob(''); form.setDobInput(''); }} placeholder="Years" disabled={isLinkedNode} />
                        </div>
                    )}
                    {!form.isAlive && (
                        <div className="form-group">
                            <label>Date of Death (DD-MM-YYYY)</label>
                            <input
                                type="text"
                                value={form.dodInput}
                                placeholder="DD-MM-YYYY"
                                inputMode="numeric"
                                onChange={e => {
                                    form.setDodInput(e.target.value);
                                    const parsed = parseDateFromDDMMYYYY(e.target.value);
                                    if (parsed) form.setDod(parsed);
                                    else if (!e.target.value) form.setDod('');
                                }}
                                disabled={isLinkedNode}
                            />
                        </div>
                    )}

                    {/* Email */}
                    <div className="form-group">
                        <label>Email {(initialData?.isEditor) && <span style={{ color: 'red' }}>*</span>}</label>
                        <input type="email" value={form.email} onChange={e => form.setEmail(e.target.value)} required={initialData?.isEditor || false} disabled={isLinkedNode} />
                    </div>

                    {/* Address */}
                    <div className="form-group">
                        <label>Address</label>
                        <textarea value={form.address} onChange={e => form.setAddress(e.target.value)} rows={3} disabled={isLinkedNode} />
                    </div>

                    {/* Education */}
                    <div className="form-group">
                        <label>Education</label>
                        {form.education.map((edu, index) => (
                            <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                                <input type="text" placeholder="Degree" value={edu.degree} onChange={e => { const newEdu = [...form.education]; newEdu[index].degree = e.target.value; form.setEducation(newEdu); }} disabled={isLinkedNode} />
                                <input type="text" placeholder="Major" value={edu.major} onChange={e => { const newEdu = [...form.education]; newEdu[index].major = e.target.value; form.setEducation(newEdu); }} disabled={isLinkedNode} />
                                <button type="button" onClick={() => form.setEducation(form.education.filter((_, i) => i !== index))} disabled={isLinkedNode}>×</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => form.setEducation([...form.education, { degree: '', major: '' }])} style={{ fontSize: '0.8em' }} disabled={isLinkedNode}>+ Add Education</button>
                    </div>

                    {/* Occupation */}
                    <div className="form-group">
                        <label>Occupation</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input type="text" placeholder="Role" value={form.occupation?.role || ''} onChange={e => form.setOccupation({ ...form.occupation, role: e.target.value, organization: form.occupation?.organization || '' })} disabled={isLinkedNode} />
                            <input type="text" placeholder="Organization" value={form.occupation?.organization || ''} onChange={e => form.setOccupation({ ...form.occupation, role: form.occupation?.role || '', organization: e.target.value })} disabled={isLinkedNode} />
                        </div>
                    </div>

                    {/* Hobbies */}
                    <div className="form-group">
                        <label>Hobbies</label>
                        <input type="text" value={form.hobbies.join(', ')} onChange={e => form.setHobbies(e.target.value.split(',').map(s => s.trim()).filter(s => s))} placeholder="Reading, Traveling, etc." disabled={isLinkedNode} />
                    </div>

                    {/* Siblings */}
                    <RelationSelect
                        label={`Siblings ${(!form.parentId) ? '(Requires Parent)' : ''}`}
                        items={form.siblingIds.map(id => ({ id, name: getNodeName(id) }))}
                        searchText={siblingSearchText}
                        onSearchChange={setSiblingSearchText}
                        suggestions={siblingSuggestions}
                        showSuggestions={!!siblingSuggestions.length && !!siblingSearchText}
                        onSelect={handleSiblingSelect}
                        onRemove={(id) => form.setSiblingIds(prev => prev.filter(sid => sid !== id))}
                        searchPlaceholder="Search to add sibling..."
                        disabled={isLinkedNode || !form.parentId}
                        emptyMessage={(!form.parentId) ? "Please select a father/parent first to manage siblings." : undefined}
                    />

                    {/* Children */}
                    <RelationSelect
                        label="Children"
                        items={form.childrenIds.map(id => ({ id, name: getNodeName(id) }))}
                        searchText={childSearch.searchText}
                        onSearchChange={childSearch.setSearchText}
                        suggestions={childSearch.suggestions}
                        showSuggestions={childSearch.showSuggestions}
                        onSelect={handleChildSelect}
                        onRemove={(id) => form.setChildrenIds(prev => prev.filter(cid => cid !== id))}
                        searchPlaceholder="Search to add child..."
                        disabled={isLinkedNode}
                    />

                    {/* Notes */}
                    <div className="form-group">
                        <label>Notes</label>
                        <textarea value={form.notes} onChange={e => form.setNotes(e.target.value)} rows={3} placeholder="Random remarks..." disabled={isLinkedNode} />
                    </div>

                </form>
            </div>
        </div>
    );
};
