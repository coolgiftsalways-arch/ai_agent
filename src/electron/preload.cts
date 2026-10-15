import {
  contextBridge,
  ipcRenderer,
} from "electron";


type ApprovalRequest = {
  requestId: string;
  message: string;
};


contextBridge.exposeInMainWorld(
  "aiAgent",
  {
    /*
    ========================================
    RUN AGENT
    ========================================
    */

    run: async (
      message: string
    ) => {
      return await ipcRenderer.invoke(
        "agent:run",
        message
      );
    },


    /*
    ========================================
    RECEIVE APPROVAL REQUEST
    ========================================
    */

    onApprovalRequest: (
      callback: (
        request:
          ApprovalRequest
      ) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request:
          ApprovalRequest
      ) => {
        callback(
          request
        );
      };


      ipcRenderer.on(
        "agent:approval-request",
        listener
      );


      /*
      React can call this cleanup
      function when it unmounts.
      */

      return () => {
        ipcRenderer.removeListener(
          "agent:approval-request",
          listener
        );
      };
    },


    /*
    ========================================
    SEND APPROVAL RESPONSE
    ========================================
    */

    respondToApproval: (
      requestId: string,
      approved: boolean
    ) => {
      ipcRenderer.send(
        "agent:approval-response",
        {
          requestId,
          approved,
        }
      );
    },
  }
);