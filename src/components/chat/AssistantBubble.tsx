import { Bot } from "lucide-react";
import { cn } from "../../lib/utils";

interface AssistantBubbleProps {
  message: { id: string; content: string };
  isRunning?: boolean;
  className?: string;
}

export function AssistantBubble({
  message,
  isRunning,
  className,
}: AssistantBubbleProps) {
  return (
    <div
      className={cn(
        "flex gap-3 w-full animate-in fade-in slide-in-from-bottom-1 duration-300",
        className,
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center">
        <Bot size={14} className="text-accent" />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-sm text-primary leading-relaxed rounded-2xl rounded-tl-md
                     bg-card border border-border px-4 py-3"
        >
          {message.content}
        </div>

        {isRunning && (
          <div className="flex gap-1 mt-2 px-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary-secondary typing-dot"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
