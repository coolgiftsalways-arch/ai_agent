import {
  google,
} from "googleapis";

import type {
  Tool,
  ToolResult,
} from "./Tool.js";

import {
  getGmailAuth,
} from "../gmail/GmailAuth.js";


export class GmailTool
  implements Tool {
  name = "gmail";


  /*
  ==========================================
  GET GMAIL CLIENT
  ==========================================
  */

  private async getClient() {
    const auth =
      await getGmailAuth();

    return google.gmail({
      version: "v1",
      auth,
    });
  }


  /*
  ==========================================
  GET EMAIL HEADER
  ==========================================
  */

  private getHeader(
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


  /*
  ==========================================
  DECODE BASE64URL
  ==========================================
  */

  private decodeBase64Url(
    value: string
  ): string {
    try {
      const normalized =
        value
          .replace(/-/g, "+")
          .replace(/_/g, "/");

      return Buffer
        .from(
          normalized,
          "base64"
        )
        .toString(
          "utf8"
        );
    } catch {
      return "";
    }
  }


  /*
  ==========================================
  ENCODE BASE64URL
  ==========================================

  Gmail expects the complete MIME email
  encoded as URL-safe base64.
  ==========================================
  */

  private encodeBase64Url(
    value: string
  ): string {
    return Buffer
      .from(
        value,
        "utf8"
      )
      .toString(
        "base64"
      )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }


  /*
  ==========================================
  ENCODE EMAIL SUBJECT
  ==========================================

  Allows UTF-8 subjects safely.
  ==========================================
  */

  private encodeSubject(
    subject: string
  ): string {
    const encoded =
      Buffer
        .from(
          subject,
          "utf8"
        )
        .toString(
          "base64"
        );

    return (
      `=?UTF-8?B?${encoded}?=`
    );
  }


  /*
  ==========================================
  HEADER INJECTION PROTECTION
  ==========================================

  Email headers must never contain
  CR/LF supplied by the model/user.
  ==========================================
  */

  private assertSafeHeader(
    value: string,
    fieldName: string
  ): void {
    if (
      /[\r\n]/.test(
        value
      )
    ) {
      throw new Error(
        `${fieldName} contains invalid newline characters.`
      );
    }
  }


  /*
  ==========================================
  EXTRACT EMAIL BODY
  ==========================================
  */

  private extractBody(
    payload: any
  ): string {
    if (!payload) {
      return "";
    }


    /*
    Plain text body directly.
    */

    if (
      payload.mimeType ===
        "text/plain" &&
      payload.body?.data
    ) {
      return this.decodeBase64Url(
        payload.body.data
      );
    }


    /*
    Search child MIME parts.
    */

    if (
      Array.isArray(
        payload.parts
      )
    ) {
      /*
      Prefer text/plain.
      */

      for (
        const part
        of payload.parts
      ) {
        if (
          part.mimeType ===
            "text/plain" &&
          part.body?.data
        ) {
          return this.decodeBase64Url(
            part.body.data
          );
        }
      }


      /*
      Search recursively.
      */

      for (
        const part
        of payload.parts
      ) {
        const nested =
          this.extractBody(
            part
          );

        if (nested) {
          return nested;
        }
      }
    }


    /*
    HTML fallback.
    */

    if (
      payload.mimeType ===
        "text/html" &&
      payload.body?.data
    ) {
      return this.decodeBase64Url(
        payload.body.data
      );
    }


    return "";
  }


  /*
  ==========================================
  RECENT EMAILS
  ==========================================
  */

  async recent(
    limit = 5
  ): Promise<ToolResult> {
    const gmail =
      await this.getClient();


    const response =
      await gmail.users
        .messages.list({
          userId: "me",

          maxResults:
            limit,

          q:
            "in:inbox",
        });


    const messages =
      response.data.messages ??
      [];


    const emails: Array<
      Record<string, unknown>
    > = [];


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
              "To",
              "Subject",
              "Date",
            ],
          });


      const headers =
        details.data.payload
          ?.headers;


      emails.push({
        id:
          message.id,

        threadId:
          details.data.threadId,

        from:
          this.getHeader(
            headers,
            "From"
          ),

        to:
          this.getHeader(
            headers,
            "To"
          ),

        subject:
          this.getHeader(
            headers,
            "Subject"
          ),

        date:
          this.getHeader(
            headers,
            "Date"
          ),

        snippet:
          details.data.snippet ??
          "",
      });
    }


    return {
      success: true,

      message:
        `Found ${emails.length} recent emails.`,

      data: {
        emails,
      },
    };
  }


  /*
  ==========================================
  SEARCH EMAILS
  ==========================================
  */

  async search(
    query: string,
    limit = 10
  ): Promise<ToolResult> {
    const gmail =
      await this.getClient();


    const response =
      await gmail.users
        .messages.list({
          userId: "me",

          q:
            query,

          maxResults:
            limit,
        });


    const messages =
      response.data.messages ??
      [];


    const emails: Array<
      Record<string, unknown>
    > = [];


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
              "To",
              "Subject",
              "Date",
            ],
          });


      const headers =
        details.data.payload
          ?.headers;


      emails.push({
        id:
          message.id,

        threadId:
          details.data.threadId,

        from:
          this.getHeader(
            headers,
            "From"
          ),

        to:
          this.getHeader(
            headers,
            "To"
          ),

        subject:
          this.getHeader(
            headers,
            "Subject"
          ),

        date:
          this.getHeader(
            headers,
            "Date"
          ),

        snippet:
          details.data.snippet ??
          "",
      });
    }


    return {
      success: true,

      message:
        `Found ${emails.length} matching emails.`,

      data: {
        query,
        emails,
      },
    };
  }


  /*
  ==========================================
  READ ONE EMAIL
  ==========================================
  */

  async read(
    id: string
  ): Promise<ToolResult> {
    const gmail =
      await this.getClient();


    const response =
      await gmail.users
        .messages.get({
          userId: "me",

          id,

          format:
            "full",
        });


    const headers =
      response.data.payload
        ?.headers;


    const body =
      this.extractBody(
        response.data.payload
      );


    return {
      success: true,

      message:
        "Email read successfully.",

      data: {
        id:
          response.data.id,

        threadId:
          response.data.threadId,

        from:
          this.getHeader(
            headers,
            "From"
          ),

        to:
          this.getHeader(
            headers,
            "To"
          ),

        subject:
          this.getHeader(
            headers,
            "Subject"
          ),

        date:
          this.getHeader(
            headers,
            "Date"
          ),

        snippet:
          response.data.snippet ??
          "",

        body,
      },
    };
  }


  /*
  ==========================================
  SEND EMAIL
  ==========================================

  IMPORTANT:

  This method performs the REAL Gmail send.

  PermissionManager will later ensure that
  this action always requires explicit user
  approval before Executor reaches here.
  ==========================================
  */

  async send(
    to: string,
    subject: string,
    body: string
  ): Promise<ToolResult> {
    /*
    ========================================
    BASIC DEFENSE-IN-DEPTH VALIDATION
    ========================================
    */

    const cleanTo =
      to.trim();

    const cleanSubject =
      subject.trim();

    const cleanBody =
      body;


    if (!cleanTo) {
      return {
        success: false,

        message:
          "Email recipient is required.",
      };
    }


    if (!cleanSubject) {
      return {
        success: false,

        message:
          "Email subject is required.",
      };
    }


    if (!cleanBody.trim()) {
      return {
        success: false,

        message:
          "Email body is required.",
      };
    }


    /*
    Protect MIME headers from newline
    injection.

    Body is allowed to contain newlines.
    */

    this.assertSafeHeader(
      cleanTo,
      "Email recipient"
    );

    this.assertSafeHeader(
      cleanSubject,
      "Email subject"
    );


    const gmail =
      await this.getClient();


    /*
    ========================================
    BUILD RFC 2822 / MIME EMAIL
    ========================================
    */

    const rawMessage = [
      `To: ${cleanTo}`,

      `Subject: ${this.encodeSubject(
        cleanSubject
      )}`,

      "MIME-Version: 1.0",

      'Content-Type: text/plain; charset="UTF-8"',

      "Content-Transfer-Encoding: 8bit",

      "",

      cleanBody,
    ].join(
      "\r\n"
    );


    /*
    Gmail requires URL-safe base64.
    */

    const raw =
      this.encodeBase64Url(
        rawMessage
      );


    /*
    ========================================
    REAL GMAIL SEND
    ========================================
    */

    const response =
      await gmail.users
        .messages.send({
          userId: "me",

          requestBody: {
            raw,
          },
        });


    return {
      success: true,

      message:
        "Email sent successfully.",

      data: {
        id:
          response.data.id,

        threadId:
          response.data.threadId,

        labelIds:
          response.data.labelIds ??
          [],

        to:
          cleanTo,

        subject:
          cleanSubject,
      },
    };
  }


  /*
  ==========================================
  EXECUTE
  ==========================================
  */

  async execute(
    action: string,
    parameters:
      Record<
        string,
        unknown
      >
  ): Promise<ToolResult> {
    try {
      switch (action) {
        case "recent":
          return await this.recent(
            parameters.limit
              ? Number(
                  parameters.limit
                )
              : 5
          );


        case "search":
          return await this.search(
            String(
              parameters.query ??
              ""
            ),

            parameters.limit
              ? Number(
                  parameters.limit
                )
              : 10
          );


        case "read":
          return await this.read(
            String(
              parameters.id ??
              ""
            )
          );


        /*
        ======================================
        SEND EMAIL
        ======================================
        */

        case "send":
          return await this.send(
            String(
              parameters.to ??
              ""
            ),

            String(
              parameters.subject ??
              ""
            ),

            String(
              parameters.body ??
              ""
            )
          );


        default:
          return {
            success: false,

            message:
              `Unknown GmailTool action: ${action}`,
          };
      }
    } catch (error) {
      return {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}