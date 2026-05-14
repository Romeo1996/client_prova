import { motion } from "framer-motion";
import { User } from "lucide-react";
import { cn } from "../../lib/utils";

interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

interface UserBubbleProps {
  message: UserMessage;
  className?: string;
}

const bubbleVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export function UserBubble({ message, className }: UserBubbleProps) {
  return (
    <motion.div
      variants={bubbleVariants}
      initial="initial"
      animate="animate"
      className={cn("flex gap-3 w-full flex-row-reverse", className)}
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
    </motion.div>
  );
}
