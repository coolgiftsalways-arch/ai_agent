import { BrowserManager, } from "../browser/BrowserManager.js";
export class BrowserTool {
    name = "browser";
    manager;
    constructor() {
        this.manager =
            new BrowserManager();
    }
    /*
    ==========================================
    EXECUTE
    ==========================================
    */
    async execute(action, parameters) {
        try {
            switch (action) {
                /*
                ======================================
                OPEN
                ======================================
                */
                case "open": {
                    const url = String(parameters.url ??
                        "");
                    const result = await this.manager
                        .open(url);
                    return {
                        success: true,
                        message: `Browser opened: ${result.url}`,
                        data: result,
                    };
                }
                /*
                ======================================
                READ PAGE
                ======================================
                */
                case "readPage": {
                    const result = await this.manager
                        .readPage();
                    return {
                        success: true,
                        message: "Browser page read successfully.",
                        data: result,
                    };
                }
                /*
                ======================================
                PAGE INFO
                ======================================
                */
                case "getInfo": {
                    const result = await this.manager
                        .getInfo();
                    return {
                        success: true,
                        message: "Browser page information retrieved.",
                        data: result,
                    };
                }
                /*
                ======================================
                CLICK
                ======================================
                */
                case "click": {
                    const target = String(parameters.target ??
                        "");
                    const result = await this.manager
                        .click(target);
                    return {
                        success: true,
                        message: `Clicked browser element: ${target}`,
                        data: result,
                    };
                }
                /*
                ======================================
                TYPE
                ======================================
                */
                case "type": {
                    const target = String(parameters.target ??
                        "");
                    const text = String(parameters.text ??
                        "");
                    const result = await this.manager
                        .type(target, text);
                    return {
                        success: true,
                        message: `Entered text into browser field: ${target}`,
                        data: result,
                    };
                }
                /*
                ======================================
                PRESS
                ======================================
                */
                case "press": {
                    const key = String(parameters.key ??
                        "");
                    const result = await this.manager
                        .press(key);
                    return {
                        success: true,
                        message: `Pressed browser key: ${key}`,
                        data: result,
                    };
                }
                /*
                ======================================
                BACK
                ======================================
                */
                case "back": {
                    const result = await this.manager
                        .back();
                    return {
                        success: true,
                        message: "Browser navigated back.",
                        data: result,
                    };
                }
                /*
                ======================================
                FORWARD
                ======================================
                */
                case "forward": {
                    const result = await this.manager
                        .forward();
                    return {
                        success: true,
                        message: "Browser navigated forward.",
                        data: result,
                    };
                }
                /*
                ======================================
                RELOAD
                ======================================
                */
                case "reload": {
                    const result = await this.manager
                        .reload();
                    return {
                        success: true,
                        message: "Browser page reloaded.",
                        data: result,
                    };
                }
                /*
                ======================================
                CLOSE
                ======================================
                */
                case "close": {
                    await this.manager
                        .close();
                    return {
                        success: true,
                        message: "Browser closed.",
                    };
                }
                default:
                    return {
                        success: false,
                        message: `Unknown BrowserTool action: ${action}`,
                    };
            }
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error
                    ? error.message
                    : String(error),
            };
        }
    }
}
