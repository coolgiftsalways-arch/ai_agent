"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("aiAgent", {
    /*
    ========================================
    RUN AGENT
    ========================================
    */
    run: async (message) => {
        return await electron_1.ipcRenderer.invoke("agent:run", message);
    },
    /*
    ========================================
    RECEIVE APPROVAL REQUEST
    ========================================
    */
    onApprovalRequest: (callback) => {
        const listener = (_event, request) => {
            callback(request);
        };
        electron_1.ipcRenderer.on("agent:approval-request", listener);
        /*
        React can call this cleanup
        function when it unmounts.
        */
        return () => {
            electron_1.ipcRenderer.removeListener("agent:approval-request", listener);
        };
    },
    /*
    ========================================
    SEND APPROVAL RESPONSE
    ========================================
    */
    respondToApproval: (requestId, approved) => {
        electron_1.ipcRenderer.send("agent:approval-response", {
            requestId,
            approved,
        });
    },
});
