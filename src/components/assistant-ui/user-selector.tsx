import { useState, type FC } from "react";
import { Input } from "src/components/ui/input";
import { cn } from "src/lib/utils";

type UserIdSelectorProps = {
  userId: string;
  onUserIdChange: (id: string) => void;
};

export const UserIdSelector: FC<UserIdSelectorProps> = ({
  userId,
  onUserIdChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(userId);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== userId) {
      onUserIdChange(trimmed);
    } else {
      setValue(userId);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-2 py-1">
        <span className="mb-1 block text-xs text-muted-foreground">User ID</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") {
              setValue(userId);
              setEditing(false);
            }
          }}
          className="h-7 text-xs"
          autoFocus
          placeholder="user-id"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "flex h-7 w-full items-center rounded-md px-2 text-xs text-muted-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "transition-colors duration-150",
      )}
      title="Click to change user ID"
    >
      <span className="truncate">User: {userId}</span>
    </button>
  );
};
