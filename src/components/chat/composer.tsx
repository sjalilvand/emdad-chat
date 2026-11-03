"use client";

import { useRef, useState } from "react";
import { Globe, ImagePlus, Landmark, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ComposerProps {
  onSend: (text: string, imageBase64?: string) => void;
  disabled?: boolean;
  webSearch: boolean;
  emdadSearch: boolean;
  onToggleWeb: () => void;
  onToggleEmdad: () => void;
  isVisionModel: boolean;
  onStop?: () => void;
  streaming?: boolean;
}

export function Composer({
  onSend,
  disabled,
  webSearch,
  emdadSearch,
  onToggleWeb,
  onToggleEmdad,
  isVisionModel,
  onStop,
  streaming,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const t = text.trim();
    if ((!t && !image) || disabled || streaming) return;
    onSend(t || "(تحلیل تصویر)", image || undefined);
    setText("");
    setImage(null);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-3xl">
        {/* کلیدهای جستجو */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleEmdad}
            aria-pressed={emdadSearch}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              emdadSearch
                ? "border-primary/40 bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
            title="پاسخ بر اساس اسناد رسمی: برنامه هفتم، دستورالعمل پذیرش، صفحات shafaf/soha/آمار"
          >
            <Landmark className="h-3.5 w-3.5" />
            پایگاه دانش امداد
            <span className={cn("h-1.5 w-1.5 rounded-full", emdadSearch ? "bg-primary" : "bg-muted-foreground/40")} />
          </button>
          <button
            type="button"
            onClick={onToggleWeb}
            aria-pressed={webSearch}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              webSearch
                ? "border-primary/40 bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
            title="جستجوی زنده در اینترنت و افزودن نتایج به پاسخ"
          >
            <Globe className="h-3.5 w-3.5" />
            جستجوی اینترنت
            <span className={cn("h-1.5 w-1.5 rounded-full", webSearch ? "bg-primary" : "bg-muted-foreground/40")} />
          </button>
        </div>

        {image && (
          <div className="mb-2 relative inline-block">
            <img src={image} alt="پیوست" className="h-20 rounded-lg border" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute -top-2 -left-2 rounded-full bg-destructive text-white p-1"
              aria-label="حذف تصویر"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40 transition-shadow">
          {isVisionModel && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                onClick={() => fileRef.current?.click()}
                aria-label="پیوست تصویر (مدل qwen2.5vl)"
                title="پیوست تصویر برای مدل دیداری qwen2.5vl"
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
            </>
          )}
          <Textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="سؤال خود را بنویسید… (Enter برای ارسال، Shift+Enter برای سطر جدید)"
            className="min-h-[44px] max-h-40 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 text-sm leading-7"
            rows={1}
            disabled={disabled}
          />
          {streaming ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-9 w-9 shrink-0"
              onClick={onStop}
              aria-label="توقف تولید پاسخ"
              title="توقف"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={disabled || (!text.trim() && !image)}
              aria-label="ارسال پیام"
              title="ارسال"
            >
              <Send className="h-4 w-4 -scale-x-100" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
