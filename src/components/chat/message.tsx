"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  Brain,
  ChevronDown,
  ExternalLink,
  FileText,
  Globe,
  User,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Markdown } from "./markdown";
import type { ChatMessageItem } from "@/types/chat";

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} گیگابایت`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} مگابایت`;
}

function ThinkingBlock({ text, duration, live }: { text: string; duration?: number; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text || text.trim().length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <div className="rounded-lg border bg-muted/40 dark:bg-muted/20">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">
              {live ? "در حال فکر کردن…" : "فرایند تفکر مدل"}
            </span>
            {live && (
              <span className="flex gap-1 items-center">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
              </span>
            )}
            {typeof duration === "number" && !live && (
              <span className="text-[10px] opacity-70">({duration} ثانیه)</span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 mr-auto transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-64 overflow-y-auto border-t px-3 py-2 text-xs leading-7 text-muted-foreground whitespace-pre-wrap">
            {text}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function SourcesBlock({ sources }: { sources: ChatMessageItem["sources"] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
        <BookOpen className="h-3 w-3" />
        <span>منابع استفاده‌شده:</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => {
          const isWeb = s.url.startsWith("http");
          const Icon = isWeb ? Globe : FileText;
          const content = (
            <>
              <Icon className="h-3 w-3 shrink-0" />
              <span className="max-w-[220px] truncate">{i + 1}. {s.title}</span>
            </>
          );
          return isWeb ? (
            <a
              key={s.key + i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={s.title}
            >
              {content}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            <span
              key={s.key + i}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
              title={s.title}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({ message }: { message: ChatMessageItem }) {
  const isUser = message.role === "user";
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  // اسکرول نرم محتوای بلوک پیام در حین استریم
  useEffect(() => {
    if (message.streaming && message.content.length > prevLen.current + 300) {
      prevLen.current = message.content.length;
    }
  }, [message.content, message.streaming]);

  if (isUser) {
    return (
      <div className="flex justify-start gap-2.5 px-2 sm:px-0">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 shadow-sm">
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt="تصویر پیوست"
              className="mb-2 max-h-56 rounded-lg border border-white/20"
            />
          )}
          <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
        </div>
        <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2.5 px-2 sm:px-0" dir="rtl">
      <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center order-2">
        <Brain className="h-4 w-4 text-primary" />
      </div>
      <div className="max-w-[90%] sm:max-w-[80%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-sm order-1">
        <ThinkingBlock
          text={message.thinking}
          duration={message.thinkingDuration}
          live={!!message.streaming && !message.content}
        />
        {message.content ? (
          <Markdown content={message.content} />
        ) : message.streaming && !message.thinking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <span>در حال پردازش و جستجو</span>
            <span className="flex gap-1 items-center">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block" />
            </span>
          </div>
        ) : null}
        {message.error && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-6">{message.error}</span>
          </div>
        )}
        <SourcesBlock sources={message.sources} />
        {message.model && !message.streaming && (
          <div className="mt-2 text-[10px] text-muted-foreground/70">
            {message.model}
            {message.thinkingDuration ? ` · ${message.thinkingDuration} ثانیه تفکر` : ""}
          </div>
        )}
      </div>
    </div>
  );
});

export { formatSize };
