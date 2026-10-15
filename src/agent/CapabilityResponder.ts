export function getCapabilityResponse(
  userInput: string
): string | null {
  const text =
    userInput
      .trim()
      .toLowerCase();


  /*
  ==========================================
  MULTIPLE EMAIL RECIPIENTS
  ==========================================
  */

  const asksMultipleEmailRecipients =
    /\b(can|could|would)\s+you\b/i.test(
      text
    ) &&
    /\b(send|email)\b/i.test(
      text
    ) &&
    /\b(2|two|multiple|more than one|several|many|people|recipients)\b/i.test(
      text
    );


  if (
    asksMultipleEmailRecipients
  ) {
    return (
      "Yes. I can send one email to multiple recipients at the same time, with up to 20 email addresses in one send."
    );
  }


  /*
  ==========================================
  BASIC EMAIL SEND CAPABILITY
  ==========================================
  */

  const asksEmailCapability =
    (
      /\bcan\s+you\b/i.test(
        text
      ) ||
      /\bare\s+you\s+able\s+to\b/i.test(
        text
      )
    ) &&
    /\b(send|email|gmail)\b/i.test(
      text
    );


  if (
    asksEmailCapability
  ) {
    return (
      "Yes. I can send Gmail messages after you provide the recipient, subject, and message and approve the send."
    );
  }


  return null;
}