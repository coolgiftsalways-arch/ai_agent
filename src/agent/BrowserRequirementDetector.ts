export type BrowserRequirement = {
  toolNames:
    string[];

  description:
    string;
};


function isCapabilityQuestion(
  text:
    string
): boolean {
  return (
    /^(can|could|would)\s+you\b/i.test(
      text
    ) ||

    /^are\s+you\s+able\s+to\b/i.test(
      text
    ) ||

    /^do\s+you\s+support\b/i.test(
      text
    )
  );
}


export function detectBrowserRequirement(
  userInput:
    string
): BrowserRequirement | null {
  const text =
    userInput
      .trim();


  if (
    !text ||
    isCapabilityQuestion(
      text
    )
  ) {
    return null;
  }


  /*
  ==========================================
  OPEN WEBSITE
  ==========================================
  */

  if (
    /\b(open|visit|go to|navigate to)\b/i.test(
      text
    ) &&

    (
      /https?:\/\//i.test(
        text
      ) ||

      /\b[a-z0-9-]+\.(com|in|org|net|io|dev|co|ai)\b/i.test(
        text
      ) ||

      /\b(website|site|browser|google|github|youtube)\b/i.test(
        text
      )
    )
  ) {
    return {
      toolNames: [
        "browser_open",
      ],

      description:
        "browser_open",
    };
  }


  /*
  ==========================================
  READ CURRENT PAGE
  ==========================================
  */

  if (
    /\b(read|inspect|check|analyze|tell me what is on|what is on)\b/i.test(
      text
    ) &&

    /\b(page|website|site|browser)\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_read_page",
      ],

      description:
        "browser_read_page",
    };
  }


  /*
  ==========================================
  CLICK
  ==========================================
  */

  if (
    /\bclick\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_click",
      ],

      description:
        "browser_click",
    };
  }


  /*
  ==========================================
  TYPE / FILL
  ==========================================
  */

  if (
    /\b(type|fill|enter|write)\b/i.test(
      text
    ) &&

    /\b(browser|page|field|input|search box|textbox|form)\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_type",
      ],

      description:
        "browser_type",
    };
  }


  /*
  ==========================================
  BROWSER BACK
  ==========================================
  */

  if (
    /\b(go back|browser back|previous page)\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_back",
      ],

      description:
        "browser_back",
    };
  }


  /*
  ==========================================
  RELOAD
  ==========================================
  */

  if (
    /\b(reload|refresh)\b/i.test(
      text
    ) &&

    /\b(page|browser|website|site)\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_reload",
      ],

      description:
        "browser_reload",
    };
  }


  /*
  ==========================================
  CLOSE
  ==========================================
  */

  if (
    /\bclose\b/i.test(
      text
    ) &&

    /\b(browser|website|page)\b/i.test(
      text
    )
  ) {
    return {
      toolNames: [
        "browser_close",
      ],

      description:
        "browser_close",
    };
  }


  return null;
}