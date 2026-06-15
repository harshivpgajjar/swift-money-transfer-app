import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Cross-platform storage that works during SSR.
 * - Native: uses AsyncStorage
 * - Web client: uses window.localStorage
 * - Web SSR (no window): no-op (returns null / does nothing)
 */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore (e.g. quota exceeded)
      }
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
