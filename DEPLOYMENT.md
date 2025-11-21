# Deployment Instructions

## Prerequisites
1.  **Google Cloud Project**:
    - Create a project in [Google Cloud Console](https://console.cloud.google.com/).
    - Enable **Google Drive API**.
    - Configure **OAuth Consent Screen** (External).
    - Create **OAuth Client ID** (Web Application).
    - Add your GitHub Pages URL (e.g., `https://<username>.github.io`) to **Authorized JavaScript origins**.
    - Update `src/config.ts` with your `CLIENT_ID`.

2.  **Google Drive Folders**:
    - Create a folder for Tree Data.
    - Create a folder for Images.
    - Share these folders as "Anyone with the link can view" (if public view is desired) or ensure users have access.
    - Update `src/config.ts` with `DRIVE_TREE_FOLDER_ID` and `DRIVE_ZS_FOLDER_ID`.

## Deploying to GitHub Pages

1.  **Create a GitHub Repository**:
    - Create a new public/private repository on GitHub.

2.  **Push Code**:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/<username>/<repo>.git
    git push -u origin main
    ```

3.  **Configure GitHub Pages**:
    - Go to Repository **Settings** > **Pages**.
    - Under **Build and deployment**, select **Source** as **GitHub Actions**.
    - The workflow `.github/workflows/deploy.yml` will automatically pick up the build and deploy.

4.  **Verify**:
    - Go to the **Actions** tab to see the deployment progress.
    - Once done, visit your site at `https://<username>.github.io/<repo>/`.

## Note on Base URL
If you are deploying to a subdirectory (like `https://<username>.github.io/<repo>/`), you need to set the base path in `vite.config.ts`.

**Action Required**:
If your repo name is NOT the root (i.e., not `<username>.github.io`), update `vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  base: '/<repo-name>/', // Replace with your repository name
})
```
