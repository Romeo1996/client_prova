interface CursorProps {
  className?: string;
}

export function ChatCursor({ className }: CursorProps) {
  return (
    <div className={`flex gap-1 px-4 py-3 ${className ?? ""}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary-secondary typing-dot"
        />
      ))}
    </div>
  );
}
