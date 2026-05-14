import labels from "./it.json";

export const L = labels as {
  chat: {
    inputPlaceholder: string;
    welcomeMessage: string;
    openSidebar: string;
  };
  sidebar: {
    newChat: string;
    close: string;
    empty: string;
    delete: string;
  };
  theme: {
    light: string;
    dark: string;
  };
  error: {
    summary: string;
    generic: string;
    network: string;
  };
  thread: {
    defaultTitle: string;
  };
};
