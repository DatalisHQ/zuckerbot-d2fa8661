import * as React from "react";

import { cn } from "@/lib/utils";

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  bodyClassName?: string;
}

function CodeBlock({
  className,
  title,
  bodyClassName,
  children,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-lowest shadow-[0_10px_36px_rgba(0,0,0,0.28)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 border-b border-outline-variant/15 bg-white/[0.02] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        {title ? <span className="ml-3 font-label text-xs text-outline">{title}</span> : null}
      </div>
      <pre className={cn("overflow-x-auto p-5 font-mono text-[13px] leading-6 text-on-surface", bodyClassName)}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export { CodeBlock };
