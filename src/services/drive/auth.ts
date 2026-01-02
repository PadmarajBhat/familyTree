
import { gapi } from 'gapi-script';
import { CONFIG } from '../../config';
import * as state from './state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

export const setAuthErrorCallback = (cb: (error: string) => void) => {
    state.setOnAuthErrorCallback(cb);
};

const setupTokenRefreshMonitor = () => {
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    state.setRefreshInterval(setInterval(() => {
        const tokenExpires = localStorage.getItem('gapi_token_expires');
        if (!tokenExpires) return;

        const expiresAt = parseInt(tokenExpires, 10);
        const now = Date.now();

        if (now >= expiresAt) {
            console.log("Session expired. Redirecting to landing page...");
            if (state.refreshInterval) clearInterval(state.refreshInterval);

            // Clear session
            state.setAccessToken(null);
            localStorage.removeItem('gapi_token');
            localStorage.removeItem('gapi_token_expires');
            localStorage.removeItem('gapi_token_scopes');

            // Redirect to force re-auth
            window.location.href = window.location.origin + import.meta.env.BASE_URL;
        }
    }, 60000));
};

const waitForGoogle = (timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (typeof google !== 'undefined') { resolve(); return; }
        const start = Date.now();
        const interval = setInterval(() => {
            if (typeof google !== 'undefined') {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject(new Error("Timeout waiting for Google library to load"));
            }
        }, 100);
    });
};

export const getUserProfile = async () => {
    try {
        const accessToken = gapi.client.getToken()?.access_token;
        if (!accessToken) return null;

        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.ok) return await response.json();
        if (response.status === 401) return null;
        throw new Error(`Failed to fetch user profile: ${response.status}`);
    } catch (error) {
        console.error("Error fetching user profile", error);
        throw error;
    }
};

export const initGoogleClient = (updateSigninStatus: (isSignedIn: boolean) => void): Promise<void> => {
    if (state.gapiInitedPromise) return state.gapiInitedPromise;

    const p = new Promise<void>((resolve, reject) => {
        gapi.load('client', () => {
            gapi.client.init({
                apiKey: CONFIG.API_KEY,
                discoveryDocs: [
                    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
                    'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest'
                ],
            }).then(() => {
                return Promise.all([gapi.client.load('drive', 'v3'), gapi.client.load('sheets', 'v4')]);
            }).then(() => {
                return waitForGoogle();
            }).then(() => {
                state.setTokenClient(google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.CLIENT_ID,
                    scope: CONFIG.SCOPES,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    callback: (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            state.setAccessToken(tokenResponse.access_token);
                            localStorage.setItem('gapi_token', tokenResponse.access_token);
                            if (tokenResponse.scope) {
                                localStorage.setItem('gapi_token_scopes', tokenResponse.scope);
                            }
                            if (tokenResponse.expires_in) {
                                const expiresAt = Date.now() + (Number(tokenResponse.expires_in) * 1000);
                                localStorage.setItem('gapi_token_expires', expiresAt.toString());
                            }
                            gapi.client.setToken(tokenResponse);
                            updateSigninStatus(true);
                        } else if (tokenResponse && (tokenResponse.error === 'interaction_required' || tokenResponse.error === 'access_denied')) {
                            if (state.onAuthErrorCallback) state.onAuthErrorCallback(tokenResponse.error);
                        }
                    },
                }));

                const storedToken = localStorage.getItem('gapi_token');
                const tokenExpires = localStorage.getItem('gapi_token_expires');
                const storedScopes = localStorage.getItem('gapi_token_scopes');
                const requiredScope = 'https://www.googleapis.com/auth/drive.appdata';

                const hasValidScopes = storedScopes && storedScopes.includes(requiredScope);

                if (storedToken && tokenExpires && parseInt(tokenExpires, 10) > Date.now() + (2 * 60 * 1000) && hasValidScopes) {
                    state.setAccessToken(storedToken);
                    gapi.client.setToken({ access_token: storedToken });
                    getUserProfile().then(profile => {
                        if (profile) updateSigninStatus(true);
                        else {
                            localStorage.removeItem('gapi_token');
                            localStorage.removeItem('gapi_token_expires');
                            localStorage.removeItem('gapi_token_scopes');
                            updateSigninStatus(false);
                        }
                    }).catch(() => {
                        localStorage.removeItem('gapi_token');
                        localStorage.removeItem('gapi_token_expires');
                        localStorage.removeItem('gapi_token_scopes');
                        updateSigninStatus(false);
                    });
                } else {
                    updateSigninStatus(false);
                }

                setupTokenRefreshMonitor();
                resolve();
            }).catch(reject);
        });
    });

    state.setGapiInitedPromise(p);
    return p;
};

export const signIn = () => {
    if (state.tokenClient) state.tokenClient.requestAccessToken();
};

export const signOut = () => {
    if (state.accessToken) {
        google.accounts.oauth2.revoke(state.accessToken, () => {
            state.setAccessToken(null);
            localStorage.removeItem('gapi_token');
            localStorage.removeItem('gapi_token_expires');
            localStorage.removeItem('gapi_token_scopes');
            window.location.reload();
        });
    }
};
