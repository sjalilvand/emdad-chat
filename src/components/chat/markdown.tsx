"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm sm:text-[0.95rem]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});
