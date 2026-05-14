import { User } from "lucide-react";
import { cn } from "../../lib/utils";

interface UserBubbleProps {
  message: { id: string; content: string };
  className?: string;
}

export function UserBubble({ message, className }: UserBubbleProps) {
  return (
    <div
      className={cn(
        "flex gap-3 w-full flex-row-reverse animate-in fade-in slide-in-from-bottom-1 duration-300",
        className,
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
        <User size={14} className="text-accent" />
      </div>

      <div className="max-w-[72%]">
        <div
          className="text-sm text-white leading-relaxed rounded-2xl rounded-tr-md
                     bg-accent px-4 py-3"
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
