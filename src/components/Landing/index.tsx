
import React from 'react';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/drive';

interface LandingProps {
    onShowPrivacy?: () => void;
    onShowTerms?: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onShowPrivacy, onShowTerms }) => {
    const { t } = useTranslation();

    return (
        <div className="welcome-screen">
            <div className="landing-content">
                <h1>{t('appTitle')}</h1>
                <p className="subtitle">{t('appSubtitle')}</p>
                <button className="cta-button" onClick={() => signIn()}>
                    {t('auth.signIn')}
                </button>
                <div style={{ marginTop: '20px', fontSize: '0.8em', color: '#666' }}>
                    <span onClick={onShowPrivacy} style={{ cursor: 'pointer', textDecoration: 'underline', marginRight: '10px' }}>Privacy Policy</span>
                    |
                    <span onClick={onShowTerms} style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: '10px' }}>Terms of Service</span>
                </div>
            </div>
        </div>
    );
};
