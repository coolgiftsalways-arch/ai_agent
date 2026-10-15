import { contextBridge, ipcRenderer, } from "electron";
contextBridge.exposeInMainWorld("aiAgent", {
    run: async (message) => {
        return await ipcRenderer.invoke("agent:run", message);
    },
});
