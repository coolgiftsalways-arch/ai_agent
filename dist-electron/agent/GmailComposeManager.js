const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAX_RECIPIENTS = 20;
export class GmailComposeManager {
    draft = null;
    /*
    ==========================================
    CLEAR
    ==========================================
    */
    clear() {
        this.draft =
            null;
    }
    /*
    ==========================================
    IS COMPOSING
    ==========================================
    */
    isComposing() {
        return this.draft !==
            null;
    }
    /*
    ==========================================
    EXTRACT EMAIL ADDRESSES
    ==========================================
    */
    extractEmails(value) {
        const matches = value.match(EMAIL_REGEX) ?? [];
        /*
        Remove duplicate addresses.
    
        Emails are normalized to lowercase.
        */
        return [
            ...new Set(matches.map((email) => email
                .trim()
                .toLowerCase())),
        ];
    }
    /*
    ==========================================
    NORMALIZE RECIPIENTS
    ==========================================
    */
    normalizeRecipients(recipients) {
        return recipients.join(", ");
    }
    /*
    ==========================================
    RECIPIENT SECTION
    ==========================================
  
    Do not accidentally treat an email
    address written inside the message body
    as another recipient.
    ==========================================
    */
    getRecipientSection(userInput) {
        return (userInput.split(/^\s*(?:Subject|Message|Body):/im)[0] ??
            userInput);
    }
    /*
    ==========================================
    EXTRACT EXPLICIT FIELDS
    ==========================================
    */
    extractFields(userInput) {
        const result = {};
        /*
        ========================================
        RECIPIENTS
        ========================================
        */
        const recipientSection = this.getRecipientSection(userInput);
        const hasRecipientCommand = /^\s*To:/im.test(recipientSection) ||
            /\b(?:send\s+(?:an?\s+)?email\s+to|email\s+to|send\s+to)\b/i.test(recipientSection) ||
            /^\s*email\s+/i.test(recipientSection);
        if (hasRecipientCommand) {
            const recipients = this.extractEmails(recipientSection);
            if (recipients.length >
                0) {
                result.to =
                    this.normalizeRecipients(recipients);
            }
        }
        /*
        ========================================
        SUBJECT
        ========================================
        */
        const subjectMatch = userInput.match(/^\s*Subject:\s*(.*)$/im);
        if (subjectMatch?.[1] !==
            undefined) {
            result.subject =
                subjectMatch[1]
                    .trim();
        }
        /*
        ========================================
        MESSAGE / BODY
        ========================================
        */
        const bodyMatch = userInput.match(/^\s*(?:Message|Body):[ \t]*([\s\S]*)$/im);
        if (bodyMatch?.[1] !==
            undefined) {
            result.body =
                bodyMatch[1]
                    .trim();
        }
        return result;
    }
    /*
    ==========================================
    VALIDATE RECIPIENT COUNT
    ==========================================
    */
    validateRecipientCount(recipients) {
        if (recipients.length >
            MAX_RECIPIENTS) {
            return {
                kind: "reply",
                message: `Please use no more than ${MAX_RECIPIENTS} recipients in one email.`,
            };
        }
        return null;
    }
    /*
    ==========================================
    PROCESS USER MESSAGE
    ==========================================
    */
    process(userInput, isEmailSendIntent) {
        const input = userInput.trim();
        const continuing = this.draft !==
            null;
        /*
        ========================================
        CANCEL EMAIL
        ========================================
        */
        if (continuing &&
            /^\s*(cancel|stop|nevermind|never\s+mind|cancel email|stop email)\s*[.!]*$/i.test(input)) {
            this.clear();
            return {
                kind: "reply",
                message: "Email cancelled.",
            };
        }
        /*
        ========================================
        NO EMAIL TASK
        ========================================
        */
        if (!continuing &&
            !isEmailSendIntent) {
            return {
                kind: "none",
            };
        }
        /*
        ========================================
        CURRENT DRAFT
        ========================================
        */
        const draft = {
            ...(this.draft ??
                {}),
        };
        const explicitFields = this.extractFields(userInput);
        /*
        ========================================
        STRUCTURED RECIPIENTS
        ========================================
        */
        if (explicitFields.to) {
            const recipients = this.extractEmails(explicitFields.to);
            const recipientError = this.validateRecipientCount(recipients);
            if (recipientError) {
                this.draft =
                    draft;
                return recipientError;
            }
            draft.to =
                this.normalizeRecipients(recipients);
        }
        /*
        ========================================
        INITIAL SEND COMMAND RECIPIENTS
        ========================================
    
        Handles:
    
        Send a@gmail.com and b@gmail.com an email
    
        Send an email to a@gmail.com, b@gmail.com
        ========================================
        */
        if (!draft.to &&
            isEmailSendIntent) {
            const recipientSection = this.getRecipientSection(userInput);
            const recipients = this.extractEmails(recipientSection);
            if (recipients.length >
                0) {
                const recipientError = this.validateRecipientCount(recipients);
                if (recipientError) {
                    this.draft =
                        draft;
                    return recipientError;
                }
                draft.to =
                    this.normalizeRecipients(recipients);
            }
        }
        /*
        ========================================
        RECIPIENT FOLLOW-UP
        ========================================
    
        AI:
        What email address(es)?
    
        User:
        one@gmail.com and two@gmail.com
        ========================================
        */
        if (continuing &&
            !draft.to) {
            const recipients = this.extractEmails(input);
            if (recipients.length >
                0) {
                const recipientError = this.validateRecipientCount(recipients);
                if (recipientError) {
                    this.draft =
                        draft;
                    return recipientError;
                }
                draft.to =
                    this.normalizeRecipients(recipients);
            }
        }
        /*
        ========================================
        STRUCTURED SUBJECT
        ========================================
        */
        if (explicitFields.subject !==
            undefined) {
            draft.subject =
                explicitFields.subject;
        }
        /*
        ========================================
        STRUCTURED BODY
        ========================================
        */
        if (explicitFields.body !==
            undefined) {
            draft.body =
                explicitFields.body;
        }
        /*
        ========================================
        INVALID RECIPIENT RESPONSE
        ========================================
    
        If we're waiting for an address:
    
        hi
        yes
        can you?
    
        must NOT become the recipient.
        ========================================
        */
        if (continuing &&
            !draft.to) {
            this.draft =
                draft;
            return {
                kind: "reply",
                message: 'Please enter one or more valid email addresses, or type "cancel".',
            };
        }
        /*
        ========================================
        STRUCTURED INPUT DETECTION
        ========================================
        */
        const hasStructuredInput = explicitFields.to !==
            undefined ||
            explicitFields.subject !==
                undefined ||
            explicitFields.body !==
                undefined;
        /*
        ========================================
        NATURAL SUBJECT FOLLOW-UP
        ========================================
    
        AI:
        What subject should I use?
    
        User:
        Project Update
        ========================================
        */
        if (continuing &&
            draft.to &&
            !draft.subject &&
            !hasStructuredInput) {
            if (input) {
                draft.subject =
                    input;
            }
        }
        /*
        ========================================
        NATURAL BODY FOLLOW-UP
        ========================================
        */
        else if (continuing &&
            draft.to &&
            draft.subject &&
            !draft.body &&
            !hasStructuredInput) {
            if (input) {
                draft.body =
                    input;
            }
        }
        /*
        ========================================
        SAVE DRAFT
        ========================================
        */
        this.draft =
            draft;
        /*
        ========================================
        REQUIRE RECIPIENT
        ========================================
        */
        if (!draft.to) {
            return {
                kind: "reply",
                message: "What email address(es) should I send it to? You can enter multiple addresses separated by commas.",
            };
        }
        /*
        ========================================
        REQUIRE SUBJECT
        ========================================
        */
        if (!draft.subject) {
            return {
                kind: "reply",
                message: "What subject should I use?",
            };
        }
        /*
        ========================================
        REQUIRE MESSAGE
        ========================================
        */
        if (!draft.body) {
            return {
                kind: "reply",
                message: "What message should I send?",
            };
        }
        /*
        ========================================
        COMPLETE EMAIL
        ========================================
        */
        return {
            kind: "ready",
            draft: {
                to: draft.to,
                subject: draft.subject,
                body: draft.body,
            },
        };
    }
}
