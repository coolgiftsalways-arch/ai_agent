import React, {
  useEffect,
  useState,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import "./style.css";


type ChatMessage = {
  role:
    | "user"
    | "assistant";

  content: string;
};


function App() {
  const [
    input,
    setInput,
  ] = useState("");


  const [
    messages,
    setMessages,
  ] = useState<
    ChatMessage[]
  >([]);


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    approval,
    setApproval,
  ] = useState<
    AgentApprovalRequest | null
  >(null);


  /*
  ==========================================
  LISTEN FOR PERMISSION REQUESTS
  ==========================================
  */

  useEffect(
    () => {
      const cleanup =
        window.aiAgent
          .onApprovalRequest(
            (
              request
            ) => {
              setApproval(
                request
              );
            }
          );


      return cleanup;
    },

    []
  );


  /*
  ==========================================
  RESPOND TO PERMISSION
  ==========================================
  */

  function respondToApproval(
    approved: boolean
  ) {
    if (!approval) {
      return;
    }


    window.aiAgent
      .respondToApproval(
        approval.requestId,
        approved
      );


    setApproval(
      null
    );
  }


  /*
  ==========================================
  SEND CHAT MESSAGE
  ==========================================
  */

  async function sendMessage() {
    const message =
      input.trim();


    if (
      !message ||
      loading
    ) {
      return;
    }


    setMessages(
      (current) => [
        ...current,

        {
          role: "user",
          content: message,
        },
      ]
    );


    setInput("");

    setLoading(
      true
    );


    try {
      const result =
        await window.aiAgent.run(
          message
        );


      const answer =
        result.success
          ? result.answer ??
            "Task completed."
          : result.message ??
            "Something went wrong.";


      setMessages(
        (current) => [
          ...current,

          {
            role:
              "assistant",

            content:
              answer,
          },
        ]
      );
    } catch (error) {
      setMessages(
        (current) => [
          ...current,

          {
            role:
              "assistant",

            content:
              error instanceof Error
                ? error.message
                : "Unable to contact the agent.",
          },
        ]
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  function handleKeyDown(
    event:
      React.KeyboardEvent<
        HTMLTextAreaElement
      >
  ) {
    if (
      event.key ===
        "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }
  }


  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="brand">
            AI Agent
          </div>

          <div className="online">
            <span />

            Local
          </div>
        </div>
      </header>


      <section className="chat">
        {messages.length ===
        0 ? (
          <div className="welcome">
            <div className="orb">
              <div className="orb-core" />
            </div>

            <p className="eyebrow">
              LOCAL AI AGENT
            </p>

            <h1>
              What can I do
              for you?
            </h1>

            <p className="subtitle">
              Qwen and your
              local tools are
              ready.
            </p>
          </div>
        ) : (
          <div className="messages">
            {messages.map(
              (
                message,
                index
              ) => (
                <div
                  className={`message ${message.role}`}
                  key={index}
                >
                  <div className="message-label">
                    {message.role ===
                    "user"
                      ? "YOU"
                      : "AI AGENT"}
                  </div>

                  <div className="message-content">
                    {
                      message.content
                    }
                  </div>
                </div>
              )
            )}


            {loading && (
              <div className="message assistant">
                <div className="message-label">
                  AI AGENT
                </div>

                <div className="thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
        )}
      </section>


      <div className="composer-wrap">
        <div className="composer">
          <textarea
            value={input}

            onChange={(
              event
            ) =>
              setInput(
                event.target.value
              )
            }

            onKeyDown={
              handleKeyDown
            }

            placeholder="Ask your AI agent..."

            rows={1}
          />


          <button
            onClick={() =>
              void sendMessage()
            }

            disabled={
              loading ||
              !input.trim()
            }
          >
            ↑
          </button>
        </div>


        <div className="composer-hint">
          Enter to send ·
          Shift + Enter for
          new line
        </div>
      </div>


      {approval && (
        <div className="approval-backdrop">
          <div className="approval-modal">
            <div className="approval-icon">
              !
            </div>


            <p className="approval-eyebrow">
              PERMISSION REQUIRED
            </p>


            <h2>
              Approve this action?
            </h2>


            <div className="approval-details">
              {
                approval.message
              }
            </div>


            <div className="approval-actions">
              <button
                className="deny-button"

                onClick={() =>
                  respondToApproval(
                    false
                  )
                }
              >
                Deny
              </button>


              <button
                className="approve-button"

                onClick={() =>
                  respondToApproval(
                    true
                  )
                }
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


const root =
  document.getElementById(
    "root"
  );


if (!root) {
  throw new Error(
    "Root element not found."
  );
}


createRoot(
  root
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);