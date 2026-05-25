import { useState, useCallback } from "react";

const STORAGE_KEY = "adk_user_id";

function getUserIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("userId");
}

function generateUserId(): string {
  return crypto.randomUUID();
}

export type UserIdentity = {
  userId: string;
  updateUserId: (id: string) => void;
};

export function useUserId(): UserIdentity {
  const [userId] = useState<string>(() => {
    const fromUrl = getUserIdFromUrl();
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      console.log("[useUserId] resolved from URL:", fromUrl);
      return fromUrl;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      console.log("[useUserId] resolved from localStorage:", stored);
      return stored;
    }
    const fresh = generateUserId();
    localStorage.setItem(STORAGE_KEY, fresh);
    console.log("[useUserId] generated fresh:", fresh);
    return fresh;
  });

  const updateUserId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    console.log("[useUserId] updateUserId ->", id, "reloading...");
    window.location.reload();
  }, []);

  return { userId, updateUserId };
}
