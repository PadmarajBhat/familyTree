
import React from 'react';
import { useTranslation } from 'react-i18next';
import { signIn, signOut } from '../../services/drive';

interface AppHeaderProps {
    treeName: string | undefined;
    isSignedIn: boolean;
    currentUser: { email: string; name: string } | null;
    setIsSignedIn: (val: boolean) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ treeName, isSignedIn, currentUser, setIsSignedIn }) => {
    const { t } = useTranslation();

    return (
        <header className="app-header">
            <div className="header-left">
                <h1>{t('app.title')}</h1>
                {treeName && <span className="tree-name">{treeName}</span>}
            </div>
            <div className="header-right">
                {isSignedIn ? (
                    <div className="user-info">
                        <span>{currentUser?.name}</span>
                        <button onClick={() => { signOut(); setIsSignedIn(false); }}>{t('auth.signOut')}</button>
                    </div>
                ) : (
                    <button onClick={() => signIn()}>{t('auth.signIn')}</button>
                )}
            </div>
        </header>
    );
};
