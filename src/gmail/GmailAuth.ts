import fs from "node:fs/promises";
import path from "node:path";

import {
  authenticate,
} from "@google-cloud/local-auth";

import {
  google,
} from "googleapis";


/*
==========================================
PATHS
==========================================
*/

const CREDENTIALS_PATH =
  path.join(
    process.cwd(),
    "config",
    "google-credentials.json"
  );


const TOKEN_PATH =
  path.join(
    process.cwd(),
    "data",
    "gmail-token.json"
  );


/*
==========================================
GMAIL PERMISSIONS
==========================================

readonly:
- read emails
- search emails
- view inbox

send:
- send emails

Sending will still be protected by our
PermissionManager later.

The OAuth permission only allows the
application to perform the action.
==========================================
*/

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];


/*
==========================================
CHECK SAVED TOKEN SCOPES
==========================================

Our previous token only had gmail.readonly.

When gmail.send is added, the old token
must NOT silently continue being used.

This function checks whether the saved
token contains every permission that the
current agent requires.
==========================================
*/

function hasRequiredScopes(
  token: unknown
): boolean {
  if (
    !token ||
    typeof token !== "object" ||
    Array.isArray(token)
  ) {
    return false;
  }


  const record =
    token as Record<
      string,
      unknown
    >;


  const rawScope =
    record.scope;


  if (
    typeof rawScope !== "string"
  ) {
    return false;
  }


  const grantedScopes =
    new Set(
      rawScope
        .split(/\s+/)
        .map(
          (scope) =>
            scope.trim()
        )
        .filter(Boolean)
    );


  return GMAIL_SCOPES.every(
    (requiredScope) =>
      grantedScopes.has(
        requiredScope
      )
  );
}


/*
==========================================
READ GOOGLE CLIENT CREDENTIALS
==========================================
*/

async function loadGoogleConfig() {
  const text =
    await fs.readFile(
      CREDENTIALS_PATH,
      "utf8"
    );


  const json =
    JSON.parse(text);


  const config =
    json.installed ??
    json.web;


  if (
    !config?.client_id ||
    !config?.client_secret
  ) {
    throw new Error(
      "Invalid Google OAuth credentials file."
    );
  }


  return config;
}


/*
==========================================
SAVE TOKEN
==========================================
*/

async function saveToken(
  token: unknown
): Promise<void> {
  await fs.mkdir(
    path.dirname(
      TOKEN_PATH
    ),
    {
      recursive: true,
    }
  );


  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify(
      token,
      null,
      2
    ),
    "utf8"
  );
}


/*
==========================================
CREATE GOOGLEAPIS OAUTH CLIENT
==========================================
*/

async function createGoogleOAuthClient() {
  const config =
    await loadGoogleConfig();


  return new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris?.[0]
  );
}


/*
==========================================
LOAD SAVED LOGIN
==========================================
*/

async function loadSavedAuth() {
  try {
    const tokenText =
      await fs.readFile(
        TOKEN_PATH,
        "utf8"
      );


    const token =
      JSON.parse(
        tokenText
      );


    /*
    ========================================
    CHECK WHETHER PERMISSIONS CHANGED
    ========================================

    If gmail.send is missing from the old
    token, return null.

    getGmailAuth() will then start the
    browser authorization flow again.
    */

    if (
      !hasRequiredScopes(
        token
      )
    ) {
      console.log(
        "🔄 Gmail permissions changed. Reauthorization required."
      );

      return null;
    }


    const client =
      await createGoogleOAuthClient();


    client.setCredentials(
      token
    );


    /*
    ========================================
    SAVE REFRESHED GOOGLE TOKENS
    ========================================

    Preserve:
    - refresh token
    - existing credentials
    - required OAuth scopes
    */

    client.on(
      "tokens",
      (newTokens) => {
        const merged = {
          ...token,
          ...client.credentials,
          ...newTokens,

          scope:
            GMAIL_SCOPES.join(
              " "
            ),
        };


        void saveToken(
          merged
        );
      }
    );


    return client;
  } catch {
    return null;
  }
}


/*
==========================================
GET GMAIL AUTH
==========================================
*/

export async function getGmailAuth() {
  /*
  ==========================================
  TRY SAVED TOKEN FIRST
  ==========================================
  */

  const savedClient =
    await loadSavedAuth();


  if (savedClient) {
    console.log(
      "✅ Using saved Gmail authorization."
    );


    return savedClient;
  }


  /*
  ==========================================
  GOOGLE AUTHORIZATION REQUIRED
  ==========================================
  */

  console.log(
    "\n🔐 Gmail authorization required..."
  );


  console.log(
    "Requested access: Gmail read + Gmail send"
  );


  /*
  This client comes from
  @google-cloud/local-auth.

  It is only used to complete Google's
  browser OAuth flow.
  */

  const localAuthClient =
    await authenticate({
      scopes:
        GMAIL_SCOPES,

      keyfilePath:
        CREDENTIALS_PATH,
    });


  /*
  ==========================================
  CREATE GOOGLEAPIS CLIENT
  ==========================================

  Do NOT return localAuthClient directly.

  We create a fresh OAuth2 client from the
  googleapis package.

  This avoids AuthClient compatibility
  problems between:
  - @google-cloud/local-auth
  - googleapis
  */

  const googleClient =
    await createGoogleOAuthClient();


  /*
  Explicitly store our required scopes.

  This lets us detect future permission
  changes reliably.
  */

  const credentials = {
    ...localAuthClient.credentials,

    scope:
      GMAIL_SCOPES.join(
        " "
      ),
  };


  googleClient.setCredentials(
    credentials
  );


  /*
  ==========================================
  SAVE NEW AUTHORIZATION
  ==========================================
  */

  await saveToken(
    credentials
  );


  /*
  ==========================================
  SAVE FUTURE TOKEN REFRESHES
  ==========================================
  */

  googleClient.on(
    "tokens",
    (newTokens) => {
      const merged = {
        ...googleClient.credentials,
        ...newTokens,

        scope:
          GMAIL_SCOPES.join(
            " "
          ),
      };


      void saveToken(
        merged
      );
    }
  );


  console.log(
    "✅ Gmail authorization saved."
  );


  console.log(
    "✅ Gmail read permission enabled."
  );


  console.log(
    "✅ Gmail send permission enabled."
  );


  return googleClient;
}