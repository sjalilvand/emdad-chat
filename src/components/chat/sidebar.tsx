"use client";

import { useState } from "react";
import { MessageSquarePlus, Trash2, X, RefreshCw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "@/types/chat";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onRefreshKb: () => void;
  kbRefreshing?: boolean;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "همین حالا";
  if (m < 60) return `${m} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR");
}

export function ChatSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onDeleteAll,
  onRefreshKb,
  kbRefreshing,
}: SidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button onClick={onNew} className="flex-1 h-10 gap-2" size="sm">
          <MessageSquarePlus className="h-4 w-4" />
          گفتگوی جدید
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          onClick={onRefreshKb}
          disabled={kbRefreshing}
          title="به‌روزرسانی صفحات سایت کمیته امداد"
          aria-label="به‌روزرسانی پایگاه دانش"
        >
          <RefreshCw className={cn("h-4 w-4", kbRefreshing && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmAll(true)}
          disabled={conversations.length === 0}
          title="حذف همه گفتگوها"
          aria-label="حذف همه گفتگوها"
        >
          <Database className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden text-muted-foreground"
          onClick={onClose}
          aria-label="بستن"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground leading-6">
              هنوز گفتگویی ثبت نشده است.
              <br />
              یک گفتگوی جدید شروع کنید.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer transition-colors",
                activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/70"
              )}
              onClick={() => onSelect(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="truncate text-[11px] text-muted-foreground mt-0.5">
                  {c.messageCount} پیام · {timeAgo(c.updatedAt)}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(c.id);
                }}
                aria-label={`حذف گفتگوی ${c.title}`}
                title="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-3 text-[11px] leading-6 text-muted-foreground">
        <div className="font-medium text-foreground/80 mb-0.5">دستیار هوشمند کمیته امداد</div>
        مبتنی بر مدل‌های محلی Ollama · پورت 8094
      </div>

      {/* حذف یک گفتگو */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف گفتگو؟</AlertDialogTitle>
            <AlertDialogDescription>
              این گفتگو و تمام پیام‌های آن برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* حذف همه */}
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف همه گفتگوها؟</AlertDialogTitle>
            <AlertDialogDescription>
              تمام {conversations.length} گفتگو و پیام‌های آن‌ها برای همیشه حذف می‌شوند. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                onDeleteAll();
                setConfirmAll(false);
              }}
            >
              حذف همه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <>
      {/* دسکتاپ */}
      <aside className="hidden lg:flex w-72 shrink-0 border-l bg-sidebar text-sidebar-foreground">
        {body}
      </aside>
      {/* موبایل */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute inset-y-0 right-0 w-[290px] max-w-[85%] border-l bg-sidebar text-sidebar-foreground shadow-xl">
            {body}
          </div>
        </div>
      )}
    </>
  );
}
