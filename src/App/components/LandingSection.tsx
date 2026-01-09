import React from 'react';
import { useTranslation } from 'react-i18next';
import './LandingSection.css';

interface LandingSectionProps {
    onSignIn: () => void;
    onPrivacyClick: () => void;
    onTermsClick: () => void;
}

export const LandingSection: React.FC<LandingSectionProps> = ({ onSignIn, onPrivacyClick, onTermsClick }) => {
    const { t } = useTranslation();

    return (
        <div className="landing-container">
            <div className="landing-card">
                <h1 className="landing-title">{t('welcomeMsg')}</h1>
                <p className="landing-subtitle">{t('tagline') || 'Explore and manage your family history with ease.'}</p>
                <button className="btn-signin" onClick={onSignIn}>
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" width="20" height="20" />
                    {t('signInWithGoogle')}
                </button>
                <div className="landing-links">
                    <button className="link-btn" onClick={onPrivacyClick}>{t('privacyPolicy')}</button>
                    <span className="separator">•</span>
                    <button className="link-btn" onClick={onTermsClick}>{t('termsOfService')}</button>
                </div>
            </div>
        </div>
    );
};
