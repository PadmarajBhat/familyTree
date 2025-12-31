
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const google: any;

export let gapiInitedPromise: Promise<void> | null = null;
export function setGapiInitedPromise(p: Promise<void> | null) { gapiInitedPromise = p; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let tokenClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTokenClient(c: any) { tokenClient = c; }

export let accessToken: string | null = null;
export function setAccessToken(t: string | null) { accessToken = t; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let refreshInterval: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setRefreshInterval(i: any) { refreshInterval = i; }

export let onAuthErrorCallback: ((error: string) => void) | null = null;
export function setOnAuthErrorCallback(cb: ((error: string) => void) | null) { onAuthErrorCallback = cb; }

export let cachedLogSpreadsheetId: string | null = null;
export function setCachedLogSpreadsheetId(id: string | null) { cachedLogSpreadsheetId = id; }

export let cachedTreeSpreadsheetId: string | null = null;
export function setCachedTreeSpreadsheetId(id: string | null) { cachedTreeSpreadsheetId = id; }
