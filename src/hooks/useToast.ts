import { useRef, useEffect } from "react";
import type { Toast } from "primereact/toast";
import { setErrorHandler } from "../services/api";
import { L } from "../labels";

export function useAppToast() {
  const toast = useRef<Toast>(null);

  useEffect(() => {
    setErrorHandler((msg) => {
      toast.current?.show({
        severity: "error",
        summary: L.error.summary,
        detail: msg,
        life: 5000,
      });
    });
  }, []);

  return toast;
}
