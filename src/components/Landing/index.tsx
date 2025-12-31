
import React from 'react';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/drive';

export const Landing: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="welcome-screen">
            <div className="landing-content">
                <h1>{t('appTitle')}</h1>
                <p className="subtitle">{t('appSubtitle')}</p>
                <button className="cta-button" onClick={() => signIn()}>
                    {t('auth.signIn')}
                </button>
            </div>
        </div>
    );
};
