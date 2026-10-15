import { app, BrowserWindow, ipcMain, } from "electron";
import path from "node:path";
import { fileURLToPath, } from "node:url";
import { Agent, } from "../agent/Agent.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
const pendingApprovals = new Map();
let approvalCounter = 0;
/*
==========================================
DENY ALL PENDING APPROVALS
==========================================
*/
function denyPendingApprovals() {
    for (const [requestId, pending,] of pendingApprovals) {
        clearTimeout(pending.timeout);
        pending.resolve(false);
        pendingApprovals.delete(requestId);
    }
}
/*
==========================================
ELECTRON APPROVAL FUNCTION
==========================================
*/
async function askElectronApproval(message) {
    if (!mainWindow ||
        mainWindow.isDestroyed()) {
        console.log("⚠️ Approval denied because the UI is unavailable.");
        return false;
    }
    approvalCounter++;
    const requestId = `approval-${Date.now()}-${approvalCounter}`;
    return await new Promise((resolve) => {
        /*
        Automatically deny if no answer
        is received within 5 minutes.
        */
        const timeout = setTimeout(() => {
            if (!pendingApprovals.has(requestId)) {
                return;
            }
            pendingApprovals.delete(requestId);
            console.log("⚠️ Approval timed out.");
            resolve(false);
        }, 5 * 60 * 1000);
        pendingApprovals.set(requestId, {
            resolve,
            timeout,
        });
        mainWindow
            ?.webContents
            .send("agent:approval-request", {
            requestId,
            message,
        });
    });
}
/*
==========================================
AI AGENT
==========================================
*/
const agent = new Agent(askElectronApproval);
/*
==========================================
APPROVAL RESPONSE FROM UI
==========================================
*/
ipcMain.on("agent:approval-response", (event, payload) => {
    /*
    Only accept approval responses from
    our own application window.
    */
    if (!mainWindow ||
        mainWindow.isDestroyed() ||
        event.sender !==
            mainWindow.webContents) {
        return;
    }
    const requestId = String(payload?.requestId ??
        "");
    if (!requestId) {
        return;
    }
    const pending = pendingApprovals.get(requestId);
    if (!pending) {
        return;
    }
    clearTimeout(pending.timeout);
    pendingApprovals.delete(requestId);
    const approved = payload?.approved ===
        true;
    console.log(approved
        ? "✅ UI permission approved."
        : "❌ UI permission denied.");
    pending.resolve(approved);
});
/*
==========================================
RUN AGENT FROM UI
==========================================
*/
ipcMain.handle("agent:run", async (_event, userInput) => {
    try {
        const input = String(userInput ?? "").trim();
        if (!input) {
            return {
                success: false,
                message: "Please enter a message.",
            };
        }
        console.log("\n🖥️ UI USER:", input);
        const answer = await agent.run(input);
        console.log("\n🤖 UI AGENT:", answer);
        return {
            success: true,
            answer,
        };
    }
    catch (error) {
        console.error("\n❌ Agent UI error:", error);
        return {
            success: false,
            message: error instanceof Error
                ? error.message
                : "Unknown agent error.",
        };
    }
});
/*
==========================================
CREATE WINDOW
==========================================
*/
function createWindow() {
    mainWindow =
        new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 900,
            minHeight: 600,
            backgroundColor: "#080808",
            title: "AI Agent",
            webPreferences: {
                preload: path.join(__dirname, "preload.cjs"),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
    if (!app.isPackaged) {
        void mainWindow.loadURL("http://localhost:5173");
    }
    else {
        const uiPath = path.resolve(__dirname, "../../dist-ui/index.html");
        void mainWindow.loadFile(uiPath);
    }
    mainWindow.on("closed", () => {
        /*
        Never leave a real action waiting
        after the window has disappeared.
        */
        denyPendingApprovals();
        mainWindow =
            null;
    });
}
/*
==========================================
APP READY
==========================================
*/
app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow
            .getAllWindows()
            .length === 0) {
            createWindow();
        }
    });
});
/*
==========================================
APP CLOSE
==========================================
*/
app.on("window-all-closed", () => {
    denyPendingApprovals();
    if (process.platform !==
        "darwin") {
        app.quit();
    }
});
