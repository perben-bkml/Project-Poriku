# Google APIs Setup for Verifikasi

This document outlines the required environment variables and setup steps for Google Drive and Google Docs integration in the verification process.

## Required Environment Variables

Add these to your `.env` file:

```env
# Google OAuth2 Credentials for Ajuan (Drive access)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Google OAuth2 Credentials for Verification (Drive and Docs access)
GOOGLE_CLIENT_ID_VERIF=your_verification_oauth_client_id
GOOGLE_CLIENT_SECRET_VERIF=your_verification_oauth_client_secret
GOOGLE_REDIRECT_URI_VERIF=http://localhost:3000/auth/google/verif/callback

# Google Drive Folder IDs
DRIVE_FOLDER_ID_AJUAN=your_ajuan_folder_id
DRIVE_FOLDER_ID_VERIF=your_verification_folder_id

# Google Docs ID for Verification Templates
DOCS_ID_VERIF=your_verification_docs_template_id

# Google Sheets Service Account Credentials
AJUAN_CLIENT_EMAIL=your_ajuan_service_account_email
AJUAN_PRIVATE_KEY=your_ajuan_service_account_private_key
VERIF_CLIENT_EMAIL=your_verif_service_account_email
VERIF_PRIVATE_KEY=your_verif_service_account_private_key

# Spreadsheet IDs
SPREADSHEET_ID_AJUAN=your_ajuan_spreadsheet_id
SPREADSHEET_ID_VERIF=your_verif_spreadsheet_id
SPREADSHEET_ID_CARISPM=your_cari_spm_spreadsheet_id
SPREADSHEET_ID_GAJI=your_gaji_spreadsheet_id
```

## Google Cloud Console Setup

### 1. Enable APIs
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Enable the following APIs:
  - Google Sheets API
  - Google Drive API
  - Google Docs API

### 2. Create OAuth 2.0 Credentials
You need to create **TWO separate** OAuth 2.0 Client IDs:

**For Ajuan (Drive access):**
- Go to "Credentials" in Google Cloud Console
- Click "Create Credentials" → "OAuth 2.0 Client IDs"
- Set Application type to "Web application"
- Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
- Copy the Client ID and Client Secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

**For Verification (Drive + Docs access):**
- Create another OAuth 2.0 Client ID
- Set Application type to "Web application"  
- Add authorized redirect URI: `http://localhost:3000/auth/google/verif/callback`
- Copy the Client ID and Client Secret to `GOOGLE_CLIENT_ID_VERIF` and `GOOGLE_CLIENT_SECRET_VERIF`

### 3. Get Folder IDs
- Create folders in Google Drive for:
  - Ajuan documents
  - Verification documents
- Copy the folder IDs from the URL (the string after `/folders/`)

## Database Setup

You need to create two tables for token storage:

```sql
-- Table for Ajuan OAuth tokens
CREATE TABLE oauth_tokens (
    id INTEGER PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for Verification OAuth tokens
CREATE TABLE oauth_tokens_verif (
    id INTEGER PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Usage

### Initialize APIs
The server automatically initializes the Google APIs on startup and when OAuth tokens are received.

### Available API Clients
- `driveVerif`: Google Drive API client for verification documents
- `docsVerif`: Google Docs API client for verification documents  
- `drive`: Google Drive API client for ajuan documents

### OAuth Flows

**For Ajuan (Drive access):**
1. Navigate to `/auth/google` to start OAuth flow
2. User authorizes the application
3. Redirects to `/auth/google/callback`
4. Tokens are stored in `oauth_tokens` table
5. `drive` API client is initialized

**For Verification (Drive + Docs access):**
1. Navigate to `/auth/google/verif` to start verification OAuth flow
2. User authorizes the application
3. Redirects to `/auth/google/verif/callback`
4. Tokens are stored in `oauth_tokens_verif` table
5. `driveVerif` and `docsVerif` API clients are initialized

## Security Notes
- Keep all credentials secure and never commit them to version control
- Use environment variables for all sensitive information
- Regularly rotate OAuth tokens and service account keys
- Ensure proper folder permissions in Google Drive