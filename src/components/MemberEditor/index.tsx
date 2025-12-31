import React, { useState, useEffect } from 'react';
import type { PersonNode } from '../../logic/types';
import { getPhotoUrl } from '../../services/drive';
import { GlobalTreeService, type SearchResult } from '../../services/GlobalTreeService';
import { formatDateToDDMMYYYY } from '../../logic/dateUtils';
import { CloseButton } from '../CloseButton';
import './MemberEditor.css';

// Hooks
import { useMemberForm } from './hooks/useMemberForm';
import { useMediaCapture } from './hooks/useMediaCapture';
import { useLocationSearch } from './hooks/useLocationSearch';
import { usePeopleSearch } from './hooks/usePeopleSearch';
import { useRelationManagement } from './hooks/useRelationManagement';
import { useMemberSubmit } from './hooks/useMemberSubmit';

// Components
import { MediaSection } from './components/MediaSection';
import { BasicInfoSection } from './components/BasicInfoSection';
import { RelationSelect } from './components/RelationSelect';
import { LocationSection } from './components/LocationSection';
import { AdvancedInfoSection } from './components/AdvancedInfoSection';

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

    // 5. Relation Logic
    const relations = useRelationManagement(initialData, existingNodes, form, isLinkedNode);

    // 6. Duplicate Search (Logic kept here as it interacts deeply with form/media pre-fill)
    const nameDuplicateSearch = usePeopleSearch({
        initialValue: '',
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => res.node.nodeId !== initialData?.nodeId),
        disabled: isLinkedNode
    });

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

    // 7. Submit Logic
    const { handleSubmit, uploading } = useMemberSubmit({
        initialData,
        currentUserEmail,
        form,
        media,
        location,
        externalLink,
        isLinkedNode,
        linkedImageUrl,
        pendingShadowNodes: relations.pendingShadowNodes,
        onSave
    });


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

                    {/* Father */}
                    <RelationSelect
                        label="Father (Parent)"
                        searchText={relations.fatherSearch.searchText}
                        onSearchChange={(val) => { relations.fatherSearch.setSearchText(val); if (!val) form.setParentId(null); }}
                        suggestions={relations.fatherSearch.suggestions}
                        showSuggestions={relations.fatherSearch.showSuggestions}
                        onSelect={relations.handleFatherSelect}
                        searchPlaceholder="Search for father..."
                        disabled={isLinkedNode}
                    />

                    {/* Spouses */}
                    <RelationSelect
                        label="Spouses"
                        items={form.spouseIds.map((id: string) => ({ id, name: relations.getNodeName(id) }))}
                        searchText={relations.spouseSearch.searchText}
                        onSearchChange={relations.spouseSearch.setSearchText}
                        suggestions={relations.spouseSearch.suggestions}
                        showSuggestions={relations.spouseSearch.showSuggestions}
                        onSelect={relations.handleSpouseSelect}
                        onRemove={(id: string) => form.setSpouseIds((prev: string[]) => prev.filter((sid: string) => sid !== id))}
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

                    {/* Advanced Info Section (Phone, Dates, Email, Address, Education, Occupation, Hobbies, Notes, Siblings, Children) */}
                    <AdvancedInfoSection
                        form={form}
                        initialData={initialData}
                        isLinkedNode={isLinkedNode}
                        siblingSearchText={relations.siblingSearchText}
                        setSiblingSearchText={relations.setSiblingSearchText}
                        siblingSuggestions={relations.siblingSuggestions}
                        handleSiblingSelect={relations.handleSiblingSelect}
                        getNodeName={relations.getNodeName}
                        childSearch={relations.childSearch}
                        handleChildSelect={relations.handleChildSelect}
                    />

                </form>
            </div>
        </div>
    );
};
