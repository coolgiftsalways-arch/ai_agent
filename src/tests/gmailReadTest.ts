import {
  google,
} from "googleapis";

import {
  getGmailAuth,
} from "../gmail/GmailAuth.js";


function getHeader(
  headers:
    | Array<{
        name?: string | null;
        value?: string | null;
      }>
    | undefined,
  name: string
): string {
  return (
    headers?.find(
      (header) =>
        header.name
          ?.toLowerCase() ===
        name.toLowerCase()
    )?.value ??
    ""
  );
}


async function main() {
  console.log(
    "\n📧 GMAIL CONNECTION TEST"
  );


  /*
  ==========================================
  GOOGLE AUTH
  ==========================================
  */

  const auth =
    await getGmailAuth();


  /*
  ==========================================
  CREATE GMAIL CLIENT
  ==========================================

  The cast is only needed because
  @google-cloud/local-auth and googleapis
  can expose slightly different AuthClient
  TypeScript definitions.

  Runtime OAuth behavior is unchanged.
  */

  const gmail =
  google.gmail({
    version: "v1",
    auth,
  });


  /*
  ==========================================
  CHECK CONNECTED ACCOUNT
  ==========================================
  */

  const profile =
    await gmail.users
      .getProfile({
        userId: "me",
      });


  console.log(
    "\n✅ Connected Gmail:"
  );

  console.log(
    profile.data.emailAddress
  );


  /*
  ==========================================
  GET LATEST 5 INBOX EMAILS
  ==========================================
  */

  const response =
    await gmail.users
      .messages.list({
        userId: "me",

        maxResults: 5,

        q: "in:inbox",
      });


  const messages =
    response.data.messages ??
    [];


  console.log(
    `\n📨 Found ${messages.length} recent emails.\n`
  );


  /*
  ==========================================
  READ EMAIL METADATA
  ==========================================
  */

  for (
    const message
    of messages
  ) {
    if (!message.id) {
      continue;
    }


    const details =
      await gmail.users
        .messages.get({
          userId: "me",

          id:
            message.id,

          format:
            "metadata",

          metadataHeaders: [
            "From",
            "Subject",
            "Date",
          ],
        });


    const headers =
      details.data.payload
        ?.headers;


    console.log(
      "--------------------------------"
    );

    console.log(
      "From:",
      getHeader(
        headers,
        "From"
      )
    );

    console.log(
      "Subject:",
      getHeader(
        headers,
        "Subject"
      )
    );

    console.log(
      "Date:",
      getHeader(
        headers,
        "Date"
      )
    );

    console.log(
      "Snippet:",
      details.data.snippet ??
        ""
    );
  }
}


main().catch(
  (error) => {
    console.error(
      "\n❌ Gmail test failed:"
    );

    console.error(
      error
    );
  }
);