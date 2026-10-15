export {};


declare global {
  type AgentApprovalRequest = {
    requestId: string;
    message: string;
  };


  interface Window {
    aiAgent: {
      run: (
        message: string
      ) => Promise<{
        success: boolean;
        answer?: string;
        message?: string;
      }>;


      onApprovalRequest: (
        callback: (
          request:
            AgentApprovalRequest
        ) => void
      ) => () => void;


      respondToApproval: (
        requestId: string,
        approved: boolean
      ) => void;
    };
  }
}