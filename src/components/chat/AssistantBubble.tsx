import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { cn } from "../../lib/utils";

interface AssistantMessage {
  id: string;
  role: "assistant";
  content: string;
}

interface AssistantBubbleProps {
  message: AssistantMessage;
  isRunning?: boolean;
  className?: string;
}

const bubbleVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function AssistantBubble({
  message,
  isRunning,
  className,
}: AssistantBubbleProps) {
  return (
    <motion.div
      variants={bubbleVariants}
      initial="initial"
      animate="animate"
      className={cn("flex gap-3 w-full", className)}
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
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary-secondary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
