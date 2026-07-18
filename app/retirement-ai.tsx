"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type AdviserMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
};

type RetirementAiProps = {
  context: Record<string, unknown>;
};

const STORAGE_KEY = "robinson-retirement-ai-chat";
const CHATGPT_SITE_ORIGIN = "https://robinson-retirement.mick353.chatgpt.site";
const QUICK_PROMPTS = [
  ["Compare rails", "Compare Rail A and Rail B for my active scenario. Explain the source-date difference in the PSS figures and the practical trade-offs."],
  ["Stress spending", "Stress-test my selected spending level. Focus on the age-75 capital floor, sequence risk and what would make the plan fragile."],
  ["Explain NCC wash", "Explain the NCC wash strategy in plain English using my current wash-cycle setting, including the separate-interest control and death-benefit-tax effect."],
  ["Annual review", "Prepare a concise annual-review brief for my active scenario: what is settled, what needs confirming, and the three most useful next checks."],
] as const;

const welcomeMessage = (): AdviserMessage => ({
  id: "welcome",
  role: "model",
  createdAt: new Date().toISOString(),
  content: "I can interpret the active retirement scenario, compare the two governed rails, explain V23 mechanics and help prepare review questions. The dashboard remains the calculation authority; I will not silently change its assumptions or present modelled outcomes as guarantees.",
});

function messageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function adviserApiUrl() {
  if (typeof window !== "undefined" && window.location.hostname === "mick353.github.io") {
    return `${CHATGPT_SITE_ORIGIN}/api/retirement-ai`;
  }
  return "/api/retirement-ai";
}

function modelReferenceUrl() {
  if (typeof document === "undefined") return "/model-reference.txt";
  return new URL("model-reference.txt", document.baseURI).toString();
}

export default function RetirementAi({ context }: RetirementAiProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AdviserMessage[]>([welcomeMessage()]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scenario = (context.activeScenario ?? {}) as Record<string, unknown>;
  const rail = String(scenario.rail ?? "B");
  const spending = Number(scenario.annualNetSpending ?? 0);
  const realReturn = Number(scenario.realReturn ?? 0);
  const targetAge = Number(scenario.targetAge ?? 75);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AdviserMessage[];
        if (Array.isArray(parsed) && parsed.length) timer = setTimeout(() => setMessages(parsed.slice(-24)), 0);
      }
    } catch { /* device-local convenience only */ }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (streaming) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-24))); } catch { /* device-local convenience only */ }
  }, [messages, streaming]);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, open, streaming]);

  const loadReference = async () => {
    if (reference) return reference;
    try {
      const response = await fetch(modelReferenceUrl(), { cache: "force-cache" });
      if (!response.ok) return "";
      const text = await response.text();
      setReference(text);
      return text;
    } catch {
      return "";
    }
  };

  const appendToMessage = (id: string, text: string) => {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + text } : message));
  };

  const sendMessage = async (requested?: string) => {
    const content = (requested ?? draft).trim();
    if (!content || streaming) return;

    const userMessage: AdviserMessage = { id: messageId("user"), role: "user", content: content.slice(0, 6_000), createdAt: new Date().toISOString() };
    const assistantId = messageId("model");
    const assistantMessage: AdviserMessage = { id: assistantId, role: "model", content: "", createdAt: new Date().toISOString() };
    const conversation = [...messages.filter((message) => message.id !== "welcome"), userMessage].slice(-16);
    setMessages((current) => [...current, userMessage, assistantMessage].slice(-24));
    setDraft("");
    setError("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const modelReference = await loadReference();
      const response = await fetch(adviserApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation, context: { ...context, modelReference } }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "The retirement adviser is temporarily unavailable.");
      }
      if (!response.body) throw new Error("The adviser returned an empty response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              received = true;
              appendToMessage(assistantId, parsed.text);
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              received = true;
              appendToMessage(assistantId, data);
            } else {
              throw parseError;
            }
          }
        }
        if (done) break;
      }
      if (!received) appendToMessage(assistantId, "I did not receive a usable answer. Please try again.");
    } catch (requestError) {
      if (controller.signal.aborted) {
        appendToMessage(assistantId, "\n\nResponse stopped.");
      } else {
        const message = requestError instanceof Error ? requestError.message : "The retirement adviser is temporarily unavailable.";
        setError(message);
        appendToMessage(assistantId, "The AI adviser could not complete this response. Your retirement model and saved scenarios are unaffected.");
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const clearConversation = () => {
    if (streaming) abortRef.current?.abort();
    setMessages([welcomeMessage()]);
    setError("");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* device-local convenience only */ }
  };

  return (
    <div className={`ai-adviser ${open ? "open" : ""}`}>
      {open && <button className="ai-backdrop" aria-label="Close retirement AI adviser" onClick={() => setOpen(false)} />}
      <section id="retirement-ai-panel" className="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title" aria-hidden={!open}>
        <header className="ai-header">
          <div className="ai-orb" aria-hidden="true">AI</div>
          <div>
            <span>Gemini · active scenario attached</span>
            <h2 id="ai-title">Retirement AI adviser</h2>
          </div>
          <button className="ai-close" type="button" onClick={() => setOpen(false)} aria-label="Close adviser">Close</button>
        </header>

        <div className="ai-context-strip" aria-label="Scenario sent with each message">
          <span><b>Rail {rail}</b></span>
          <span>{spending ? `$${Math.round(spending / 1_000)}k` : "—"} spend</span>
          <span>{(realReturn * 100).toFixed(1)}% real</span>
          <span>to age {targetAge}</span>
        </div>

        <details className="ai-disclosure">
          <summary>What the adviser receives</summary>
          <p>Your message, recent chat, the active dashboard scenario, rail definitions, deterministic and probability outputs, ledger, PSS/VR/NCC controls, sources and the detailed V23 model reference are sent by this site&apos;s protected server connection to Google Gemini. The API credential is never exposed to the browser. Chat history is retained only in this browser by this site.</p>
        </details>

        <div className="ai-quick-prompts" aria-label="Suggested questions">
          {QUICK_PROMPTS.map(([label, prompt]) => <button key={label} type="button" onClick={() => void sendMessage(prompt)} disabled={streaming}>{label}</button>)}
        </div>

        <div className="ai-messages" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((message) => (
            <article className={`ai-message ${message.role}`} key={message.id}>
              <div className="ai-message-meta"><b>{message.role === "user" ? "You" : "Retirement AI"}</b><time>{formatTime(message.createdAt)}</time></div>
              <div className="ai-message-body">{message.content || (streaming ? <span className="ai-thinking">Reviewing the active model…</span> : "")}</div>
            </article>
          ))}
        </div>

        {error && <div className="ai-error" role="alert">{error}</div>}

        <form className="ai-composer" onSubmit={submit}>
          <label htmlFor="retirement-ai-message">Ask about this retirement scenario</label>
          <textarea id="retirement-ai-message" ref={textareaRef} rows={3} value={draft} maxLength={6_000} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. What changes if I spend $120k and returns are weaker early?" disabled={streaming} />
          <div>
            <button className="ai-clear" type="button" onClick={clearConversation}>Reset chat</button>
            <span>Shift + Enter for a new line</span>
            {streaming ? <button className="ai-send stop" type="button" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="ai-send" type="submit" disabled={!draft.trim()}>Send</button>}
          </div>
        </form>
        <footer>AI interpretation only · governed dashboard calculations remain unchanged</footer>
      </section>

      <button className="ai-launcher" type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="retirement-ai-panel">
        <span className="ai-launcher-orb">AI</span>
        <span><b>Retirement AI</b><small>Ask about this scenario</small></span>
      </button>
    </div>
  );
}
