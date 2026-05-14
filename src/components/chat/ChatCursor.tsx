import { motion } from "framer-motion";

const dotVariants = {
  animate: (i: number) => ({
    y: [0, -4, 0],
    transition: {
      repeat: Infinity,
      duration: 0.6,
      delay: i * 0.15,
      ease: "easeInOut",
    },
  }),
};

export function ChatCursor() {
  return (
    <div className="flex gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          custom={i}
          variants={dotVariants}
          animate="animate"
          className="w-1.5 h-1.5 rounded-full bg-primary-secondary"
        />
      ))}
    </div>
  );
}
