"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Landmark,
  Menu,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/chat/theme-toggle";
import { ChatSidebar } from "@/components/chat/sidebar";
import { Composer } from "@/components/chat/composer";
import { MessageItem } from "@/components/chat/message";
import { cn } from "@/lib/utils";
import type { ChatMessageItem, ConversationItem, ModelItem, SourceItem } from "@/types/chat";

const SUGGESTIONS = [
  {
    icon: Landmark,
    title: "برنامه پنج‌ساله هفتم",
    text: "اهداف کمی حکم ۴ برنامه پنج‌ساله هفتم کمیته امداد درباره اشتغال چیست؟",
  },
  {
    icon: Sparkles,
    title: "دستورالعمل پذیرش",
    text: "شرایط عمومی پذیرش نیازمندان در کمیته امداد چیست و چه مدارکی لازم است؟",
  },
  {
    icon: Sun,
    title: "آمار و عملکرد",
    text: "آخرین آمار و عملکرد کمیته امداد چقدر است؟",
  },
  {
    icon: Moon,
    title: "میز خدمت سُها",
    text: "سامانه سُها (میز خدمت الکترونیک کمیته امداد) چه خدماتی ارائه می‌دهد؟",
  },
];

export default function Home() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [ollamaError, setOllamaError] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [webSearch, setWebSearch] = useState(false);
  const [emdadSearch, setEmdadSearch] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [kbRefreshing, setKbRefreshing] = useState(false);
  const [mockMode, setMockMode] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---------- بارگذاری اولیه ----------
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      const data = await res.json();
      setOllamaOk(data.ok);
      setOllamaError(data.error || "");
      setMockMode(!!data.mock);
      setModels(data.models || []);
      if (data.ok && data.models.length > 0) {
        // اولویت: qwen3:8b سپس qwen3:4b سپس اولین مدل
        const preferred =
          data.models.find((m: ModelItem) => m.name.startsWith("qwen3:8b")) ||
          data.models.find((m: ModelItem) => m.name.startsWith("qwen3")) ||
          data.models[0];
        setSelectedModel((prev) => prev || preferred.name);
      }
    } catch {
      setOllamaOk(false);
      setOllamaError("سرویس مدل در دسترس نیست");
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadModels();
  }, [loadConversations, loadModels]);

  // اسکرول به پایین در پیام‌های جدید
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ---------- انتخاب گفتگو ----------
  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: ChatMessageItem) => ({
          ...m,
          sources: m.sources || [],
          thinking: m.thinking || "",
        }))
      );
    } catch {
      /* ignore */
    }
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      loadConversations();
    },
    [activeId, loadConversations]
  );

  const deleteAllConversations = useCallback(async () => {
    await fetch("/api/conversations", { method: "DELETE" });
    setActiveId(null);
    setMessages([]);
    loadConversations();
  }, [loadConversations]);

  const refreshKb = useCallback(async () => {
    setKbRefreshing(true);
    try {
      await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
    } catch {
      /* ignore */
    }
    setKbRefreshing(false);
  }, []);

  // ---------- ارسال پیام با استریم SSE ----------
  const sendMessage = useCallback(
    async (text: string, imageBase64?: string) => {
      if (streaming) return;
      setStreaming(true);

      const userMsg: ChatMessageItem = {
        id: `tmp-u-${Date.now()}`,
        role: "user",
        content: text,
        thinking: "",
        sources: [],
        imageUrl: imageBase64,
      };
      const assistantMsg: ChatMessageItem = {
        id: `tmp-a-${Date.now()}`,
        role: "assistant",
        content: "",
        thinking: "",
        sources: [],
        model: selectedModel || "ollama",
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      const updateAssistant = (patch: Partial<ChatMessageItem>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m))
        );
      };

      let thinkStart = 0;
      let thinkEnd = 0;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeId || undefined,
            message: text,
            model: selectedModel,
            webSearch,
            emdadSearch,
            imageBase64,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "خطای ارتباط با سرور" }));
          updateAssistant({ streaming: false, error: (err as { error?: string }).error || "خطا" });
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8", { stream: true });
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            switch (evt.type) {
              case "meta":
                if (!activeId && typeof evt.conversationId === "string") setActiveId(evt.conversationId);
                break;
              case "sources":
                updateAssistant({
                  sources: (evt.sources as SourceItem[]) || [],
                });
                break;
              case "thinking_delta":
                if (!thinkStart) thinkStart = Date.now();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, thinking: m.thinking + (evt.text as string) } : m
                  )
                );
                break;
              case "content_delta":
                if (thinkStart && !thinkEnd) {
                  thinkEnd = Date.now();
                  const dur = Math.round((thinkEnd - thinkStart) / 1000);
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsg.id ? { ...m, thinkingDuration: dur } : m))
                  );
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: m.content + (evt.text as string) } : m
                  )
                );
                break;
              case "error":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, error: (evt.message as string) + (m.error ? "\n" + m.error : "") }
                      : m
                  )
                );
                break;
              case "done":
                updateAssistant({ streaming: false });
                break;
            }
          }
        }
        updateAssistant({ streaming: false });
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          updateAssistant({
            streaming: false,
            content: (assistantMsg.content || "") + "\n\n*— تولید پاسخ متوقف شد —*",
          });
        } else {
          updateAssistant({ streaming: false, error: "ارتباط با سرور قطع شد" });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        loadConversations();
      }
    },
    [streaming, activeId, selectedModel, webSearch, emdadSearch, loadConversations]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const isVisionModel = selectedModel.toLowerCase().includes("vl") || selectedModel.toLowerCase().includes("vision");

  return (
    <div className="flex h-dvh overflow-hidden" dir="rtl">
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={openConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onDeleteAll={deleteAllConversations}
        onRefreshKb={refreshKb}
        kbRefreshing={kbRefreshing}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* هدر */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="فهرست گفتگوها"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-5">دستیار هوشمند کمیته امداد</h1>
              <p className="truncate text-[11px] text-muted-foreground leading-4">
                پاسخ‌گویی بر پایه اسناد رسمی و مدل‌های محلی
              </p>
            </div>
          </div>

          <div className="mr-auto flex items-center gap-1.5 sm:gap-2">
            {/* وضعیت Ollama و انتخاب مدل */}
            <div className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  streaming
                    ? "bg-yellow-500 animate-pulse"
                    : ollamaOk === true
                      ? "bg-emerald-500"
                      : ollamaOk === false
                        ? "bg-red-500"
                        : "bg-muted-foreground"
                )}
                title={ollamaOk ? "متصل" : ollamaError || "در حال بررسی"}
              />
              <Select value={selectedModel || undefined} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-6 w-[130px] sm:w-[170px] border-0 bg-transparent p-0 shadow-none focus:ring-0 text-xs">
                  <SelectValue placeholder={ollamaOk ? "انتخاب مدل" : "بدون اتصال"} />
                </SelectTrigger>
                <SelectContent>
                  {models.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">مدلی یافت نشد</div>
                  )}
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name} className="text-xs">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* هشدار اتصال */}
        {ollamaOk === false && !mockMode && (
          <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="leading-6">
              اتصال به Ollama برقرار نیست. مطمئن شوید سرویس Ollama روی سرور اجرا است
              (<code className="mx-1 rounded bg-destructive/20 px-1">ollama serve</code>) و آدرس آن در متغیر
              <code className="mx-1 rounded bg-destructive/20 px-1">OLLAMA_BASE_URL</code> تنظیم شده است.
            </div>
          </div>
        )}
        {mockMode && (
          <div className="border-b bg-yellow-500/10 px-4 py-1.5 text-center text-[11px] text-yellow-700 dark:text-yellow-400">
            حالت آزمایشی فعال است (MOCK_LLM=true) — پاسخ‌ها واقعی نیستند؛ برای پاسخ واقعی این متغیر را حذف کنید.
          </div>
        )}

        {/* ناحیه پیام‌ها */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Landmark className="h-9 w-9 text-primary" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold">دستیار هوشمند کمیته امداد امام خمینی (ره)</h2>
                <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                  سؤالات خود را درباره برنامه پنج‌ساله هفتم، دستورالعمل پذیرش، سامانه شفافیت،
                  آمار و عملکرد، میز خدمت (سُها) یا هر موضوع دیگر بپرسید.
                </p>
                <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => sendMessage(s.text)}
                      className="group rounded-xl border bg-card p-3.5 text-right transition-all hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-center gap-2">
                        <s.icon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">{s.title}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-6 text-muted-foreground">{s.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <MessageItem key={m.id} message={m} />
                ))}
              </div>
            )}
            <div ref={bottomRef} className="h-2" />
          </div>
        </div>

        <Composer
          onSend={sendMessage}
          disabled={streaming}
          webSearch={webSearch}
          emdadSearch={emdadSearch}
          onToggleWeb={() => setWebSearch((v) => !v)}
          onToggleEmdad={() => setEmdadSearch((v) => !v)}
          isVisionModel={isVisionModel}
          onStop={stopStreaming}
          streaming={streaming}
        />
      </main>
    </div>
  );
}
