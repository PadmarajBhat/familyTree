
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signIn, signOut } from '../../services/drive';
import './AppHeader.css';

interface AppHeaderProps {
    treeName: string | undefined;
    isSignedIn: boolean;
    currentUser: { email: string; name: string } | null;
    setIsSignedIn: (val: boolean) => void;
    onShowSearch: () => void;
    onShowFindRelation: () => void;
    onShowCollaborators: () => void;
    onShowHistory: () => void;
    onShowDashboard: () => void;
    onSetDefault: () => void;
    onSetViewState: (view: 'home' | 'tree') => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    treeName, isSignedIn, currentUser, setIsSignedIn,
    onShowSearch, onShowFindRelation, onShowCollaborators, onShowHistory, onShowDashboard,
    onSetDefault, onSetViewState
}) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);

    const toggleMenu = () => setMenuOpen(!menuOpen);

    return (
        <header className="app-header">
            <div className="header-left">
                <h1 onClick={() => onSetViewState('home')} style={{ cursor: 'pointer' }}>{t('appTitle')}</h1>
                {treeName && <span className="tree-name">{treeName}</span>}
            </div>
            <div className="header-right">
                {isSignedIn ? (
                    <div className="menu-container">
                        <button className="menu-button" onClick={toggleMenu}>
                            ☰
                        </button>
                        {menuOpen && (
                            <div className="dropdown-menu" onClick={() => setMenuOpen(false)}>
                                <div className="menu-item user-label">{currentUser?.name}</div>
                                <div className="menu-divider" />
                                <button className="menu-item" onClick={onShowSearch}>{t('menu.search')}</button>
                                <button className="menu-item" onClick={onShowFindRelation}>{t('menu.findRelation')}</button>
                                <button className="menu-item" onClick={onShowCollaborators}>{t('menu.editors')}</button>
                                <button className="menu-item" onClick={onShowHistory}>{t('menu.history')}</button>
                                <button className="menu-item" onClick={onShowDashboard}>{t('menu.dashboard')}</button>
                                <button className="menu-item" onClick={onSetDefault}>{t('menu.setDefault')}</button>
                                <div className="menu-divider" />
                                <button className="menu-item" onClick={() => onSetViewState('home')}>{t('menu.changeTree')}</button>
                                <button className="menu-item" onClick={() => { signOut(); setIsSignedIn(false); }}>{t('menu.signOut')}</button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button onClick={() => signIn()}>{t('auth.signIn')}</button>
                )}
            </div>
        </header>
    );
};
