import { google } from "googleapis";
import { getGmailAuth } from "../gmail/GmailAuth.js";
/**
 * NEXA Gmail tool.
 *
 * All real Gmail access uses the OAuth client from GmailAuth.
 * Executor and PermissionManager must authorize gmail.send before
 * execute("send", ...) is called. Do not expose send() to an
 * untrusted renderer or call it outside the approved tool pipeline.
 */
export class GmailTool {
    name = "gmail";
    async getClient() {
        const auth = await getGmailAuth();
        return google.gmail({ version: "v1", auth });
    }
    getHeader(headers, name) {
        return (headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "");
    }
    decodeBase64Url(value) {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(normalized, "base64").toString("utf8");
    }
    encodeBase64Url(value) {
        return Buffer.from(value, "utf8")
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }
    assertSafeHeader(value, field) {
        if (/[\r\n\0]/.test(value)) {
            throw new Error(`${field} contains an invalid header character.`);
        }
    }
    /** Locate the requested MIME type anywhere in the multipart tree. */
    findMimeBody(part, mimeType) {
        if (!part)
            return null;
        // Attachments are not inline message bodies.
        if (part.filename || part.body?.attachmentId)
            return null;
        if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) {
            return this.decodeBase64Url(part.body.data);
        }
        for (const child of part.parts ?? []) {
            const result = this.findMimeBody(child, mimeType);
            if (result !== null)
                return result;
        }
        return null;
    }
    /** Convert an HTML-only email to plain display text (not rendered HTML). */
    htmlToText(html) {
        return html
            .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/gi, " ")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&apos;|&#39;/gi, "'")
            .replace(/&amp;/gi, "&")
            .replace(/&#(\d+);/g, (_, number) => {
            const point = Number(number);
            return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
                ? String.fromCodePoint(point)
                : "";
        })
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const point = parseInt(hex, 16);
            return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
                ? String.fromCodePoint(point)
                : "";
        })
            .replace(/\r\n?/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
    getReadableBody(payload) {
        const plain = this.findMimeBody(payload, "text/plain");
        if (plain !== null)
            return { body: plain, bodyFormat: "text/plain" };
        const html = this.findMimeBody(payload, "text/html");
        if (html !== null) {
            return {
                body: this.htmlToText(html),
                bodyFormat: "text/html converted to text",
            };
        }
        return { body: "", bodyFormat: "unavailable" };
    }
    validLimit(value, fallback) {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            throw new Error("Email limit must be an integer.");
        }
        if (value < 1 || value > 25) {
            throw new Error("Email limit must be between 1 and 25.");
        }
        return value || fallback;
    }
    /** Fetch actual message metadata for results, not invented summaries. */
    async getMessageSummaries(gmail, items) {
        const emails = [];
        for (const item of items) {
            if (!item.id)
                continue;
            const detail = await gmail.users.messages.get({
                userId: "me",
                id: item.id,
                format: "metadata",
                metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            const data = detail.data;
            const headers = data.payload?.headers;
            emails.push({
                id: data.id ?? item.id,
                threadId: data.threadId ?? "",
                from: this.getHeader(headers, "From"),
                to: this.getHeader(headers, "To"),
                subject: this.getHeader(headers, "Subject"),
                date: this.getHeader(headers, "Date"),
                snippet: data.snippet ?? "",
            });
        }
        return emails;
    }
    async recent(limit = 5) {
        const gmail = await this.getClient();
        const count = this.validLimit(limit, 5);
        const response = await gmail.users.messages.list({
            userId: "me",
            q: "in:inbox",
            maxResults: count,
        });
        const emails = await this.getMessageSummaries(gmail, response.data.messages ?? []);
        return {
            success: true,
            message: `Found ${emails.length} recent inbox emails.`,
            data: { emails },
        };
    }
    async search(query, limit = 10) {
        const term = query.trim();
        if (!term || term.length > 2048) {
            return { success: false, message: "A valid Gmail search query is required." };
        }
        const gmail = await this.getClient();
        const count = this.validLimit(limit, 10);
        const response = await gmail.users.messages.list({
            userId: "me",
            q: term,
            maxResults: count,
        });
        const emails = await this.getMessageSummaries(gmail, response.data.messages ?? []);
        return {
            success: true,
            message: `Found ${emails.length} matching emails.`,
            data: { query: term, emails },
        };
    }
    async read(id) {
        const messageId = id.trim();
        if (!messageId || /\s/.test(messageId) || messageId.length > 256) {
            return { success: false, message: "A valid Gmail message ID is required." };
        }
        const gmail = await this.getClient();
        const response = await gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
        });
        const message = response.data;
        const headers = message.payload?.headers;
        const { body, bodyFormat } = this.getReadableBody(message.payload);
        return {
            success: true,
            message: body
                ? "Email read successfully."
                : "Email metadata retrieved, but no inline readable body was available.",
            data: {
                id: message.id ?? messageId,
                threadId: message.threadId ?? "",
                from: this.getHeader(headers, "From"),
                to: this.getHeader(headers, "To"),
                subject: this.getHeader(headers, "Subject"),
                date: this.getHeader(headers, "Date"),
                snippet: message.snippet ?? "",
                body,
                bodyFormat,
            },
        };
    }
    /**
     * Actual Gmail send: the Executor/PermissionManager must approve FIRST.
     * Only supports comma-separated plain email addresses (not display names).
     */
    async send(to, subject, body) {
        const recipientText = to.trim();
        const cleanSubject = subject.trim();
        this.assertSafeHeader(recipientText, "Recipient");
        this.assertSafeHeader(cleanSubject, "Subject");
        const recipients = recipientText.split(",").map((item) => item.trim());
        const addressPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
        if (recipients.length < 1 ||
            recipients.length > 20 ||
            recipients.some((item) => !addressPattern.test(item))) {
            return {
                success: false,
                message: "Provide 1–20 valid recipient email addresses, separated by commas.",
            };
        }
        if (!cleanSubject || !body.trim()) {
            return { success: false, message: "Email subject and body are required." };
        }
        const normalizedBody = body.replace(/\r\n?|\n/g, "\r\n");
        const bodyBase64 = Buffer.from(normalizedBody, "utf8")
            .toString("base64")
            .match(/.{1,76}/g)
            ?.join("\r\n") ?? "";
        const subjectBase64 = Buffer.from(cleanSubject, "utf8").toString("base64");
        const mime = [
            `To: ${recipients.join(", ")}`,
            `Subject: =?UTF-8?B?${subjectBase64}?=`,
            "MIME-Version: 1.0",
            'Content-Type: text/plain; charset="UTF-8"',
            "Content-Transfer-Encoding: base64",
            "",
            bodyBase64,
        ].join("\r\n");
        const gmail = await this.getClient();
        const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: this.encodeBase64Url(mime) },
        });
        return {
            success: true,
            message: "Email sent successfully.",
            data: {
                id: response.data.id ?? "",
                threadId: response.data.threadId ?? "",
                labelIds: response.data.labelIds ?? [],
                to: recipients.join(", "),
                subject: cleanSubject,
            },
        };
    }
    async execute(action, parameters) {
        try {
            switch (action) {
                case "recent":
                    return await this.recent(parameters.limit === undefined ? 5 : Number(parameters.limit));
                case "search":
                    return await this.search(String(parameters.query ?? ""), parameters.limit === undefined ? 10 : Number(parameters.limit));
                case "read":
                    return await this.read(String(parameters.id ?? ""));
                case "send":
                    return await this.send(String(parameters.to ?? ""), String(parameters.subject ?? ""), String(parameters.body ?? ""));
                default:
                    return { success: false, message: `Unknown Gmail action: ${action}` };
            }
        }
        catch (error) {
            // Never include token contents in logs or returned errors.
            const detail = error instanceof Error ? error.message : String(error);
            return { success: false, message: `Gmail operation failed: ${detail}` };
        }
    }
}
