import type {
  Tool,
} from "ollama";


export const browserTools:
  Tool[] = [

  /*
  ==========================================
  OPEN URL
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_open",

      description:
        "Open a website in the local browser using Playwright.",

      parameters: {
        type:
          "object",

        properties: {
          url: {
            type:
              "string",

            description:
              "Website URL to open, for example https://google.com",
          },
        },

        required: [
          "url",
        ],
      },
    },
  },


  /*
  ==========================================
  READ PAGE
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_read_page",

      description:
        "Read visible text from the currently open browser page.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },


  /*
  ==========================================
  GET INFO
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_get_info",

      description:
        "Get the current browser page title and URL.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },


  /*
  ==========================================
  CLICK
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_click",

      description:
        "Click a visible browser element. Prefer visible text such as Search, Login, Documentation, Next, or a CSS selector when needed.",

      parameters: {
        type:
          "object",

        properties: {
          target: {
            type:
              "string",

            description:
              "Visible element text or CSS selector.",
          },
        },

        required: [
          "target",
        ],
      },
    },
  },


  /*
  ==========================================
  TYPE
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_type",

      description:
        "Fill text into a browser input using its label, placeholder, or CSS selector.",

      parameters: {
        type:
          "object",

        properties: {
          target: {
            type:
              "string",

            description:
              "Input label, placeholder, or CSS selector.",
          },

          text: {
            type:
              "string",

            description:
              "Exact text to enter.",
          },
        },

        required: [
          "target",
          "text",
        ],
      },
    },
  },


  /*
  ==========================================
  PRESS KEY
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_press",

      description:
        "Press a keyboard key in the browser, for example Enter, Escape, Tab, ArrowDown.",

      parameters: {
        type:
          "object",

        properties: {
          key: {
            type:
              "string",
          },
        },

        required: [
          "key",
        ],
      },
    },
  },


  /*
  ==========================================
  BACK
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_back",

      description:
        "Navigate the browser back one page.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },


  /*
  ==========================================
  FORWARD
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_forward",

      description:
        "Navigate the browser forward one page.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },


  /*
  ==========================================
  RELOAD
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_reload",

      description:
        "Reload the current browser page.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },


  /*
  ==========================================
  CLOSE
  ==========================================
  */

  {
    type:
      "function",

    function: {
      name:
        "browser_close",

      description:
        "Close the Playwright browser.",

      parameters: {
        type:
          "object",

        properties:
          {},
      },
    },
  },
];


/*
==========================================
MAP BROWSER TOOL CALL
==========================================
*/

export function mapBrowserToolCall(
  name: string,

  args:
    Record<
      string,
      unknown
    >
) {
  switch (
    name
  ) {
    case "browser_open":
      return {
        tool:
          "browser",

        action:
          "open",

        parameters:
          args,
      };


    case "browser_read_page":
      return {
        tool:
          "browser",

        action:
          "readPage",

        parameters:
          args,
      };


    case "browser_get_info":
      return {
        tool:
          "browser",

        action:
          "getInfo",

        parameters:
          args,
      };


    case "browser_click":
      return {
        tool:
          "browser",

        action:
          "click",

        parameters:
          args,
      };


    case "browser_type":
      return {
        tool:
          "browser",

        action:
          "type",

        parameters:
          args,
      };


    case "browser_press":
      return {
        tool:
          "browser",

        action:
          "press",

        parameters:
          args,
      };


    case "browser_back":
      return {
        tool:
          "browser",

        action:
          "back",

        parameters:
          args,
      };


    case "browser_forward":
      return {
        tool:
          "browser",

        action:
          "forward",

        parameters:
          args,
      };


    case "browser_reload":
      return {
        tool:
          "browser",

        action:
          "reload",

        parameters:
          args,
      };


    case "browser_close":
      return {
        tool:
          "browser",

        action:
          "close",

        parameters:
          args,
      };


    default:
      return null;
  }
}