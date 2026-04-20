"use client";

import React, { useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export function HelpBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "bot" | "user"; text: string }[]>([
    {
      role: "bot",
      text: "Hello! I am the Pinamungajan HR assistant. How can I help you today?",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text: inputMessage }]);
    setInputMessage("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "I am a helpful assistant for Pinamungajan HR. For support with documents, ensure they are scanned clearly before uploading. If you encounter errors, check your network connection or contact IT support.",
        },
      ]);
    }, 1000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-app-border bg-app-surface shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 ${isOpen ? "hidden" : "flex"}`}
        title="Help"
        aria-label="Open help assistant"
      >
        <BrandLogo variant="floating" className="pointer-events-none" />
      </button>

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(32rem,80vh)] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-app-border bg-app-primary px-4 py-3 text-app-on-primary">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
              <span className="font-semibold">HR help</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 transition-colors hover:bg-app-on-primary/15"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-app-bg p-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-md bg-app-primary text-app-on-primary"
                      : "rounded-bl-md border border-app-border bg-app-surface text-app-text"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-app-border bg-app-surface p-3">
            <form onSubmit={handleSend} className="relative flex items-center">
              <input
                type="text"
                placeholder="Ask a question…"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="app-input py-2.5 pl-4 pr-12"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-app-primary text-app-on-primary transition-colors hover:bg-app-primary-hover disabled:bg-app-border disabled:text-app-muted"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
