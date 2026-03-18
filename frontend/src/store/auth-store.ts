import { create } from "zustand";

const USER_ID_KEY = "pws_user_id";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

type AuthState = {
  user: AuthUser | null;
  initialize: () => void;
};

function ensureLocalUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialize: () => {
    const id = ensureLocalUserId();
    set({
      user: {
        id,
        email: "dev@promptworkflow.local",
        displayName: "Local Dev",
      },
    });
  },
}));

export function getLocalAuthUserId(): string {
  return ensureLocalUserId();
}
