import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

/* Foreground behaviour: show a heads-up banner even while the app is open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let registered = false;

/* Register this device for Expo push and store the token against the signed-in
   user. Safe to call repeatedly; no-ops after the first success per app run. */
export async function registerForPush(userId: string): Promise<void> {
  if (registered) return;
  try {
    if (!Device.isDevice) return; // simulators have no push token

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Swift Money",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0E7B57",
      });
    }

    // Field name varies across expo-modules-core versions — read both.
    // (The shipped PermissionResponse type resolves empty, so go through any.)
    const ok = (p: unknown) => {
      const r = p as { granted?: boolean; status?: string };
      return r.granted === true || r.status === "granted";
    };
    let granted = ok(await Notifications.getPermissionsAsync());
    if (!granted) granted = ok(await Notifications.requestPermissionsAsync());
    if (!granted) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    await supabase
      .from("push_tokens")
      .upsert(
        { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: "user_id,token" },
      );
    registered = true;
  } catch {
    // Push is best-effort — never block the app on it.
  }
}

/* Drop this device's tokens on sign-out so a logged-out phone stops pinging. */
export async function unregisterPush(userId: string): Promise<void> {
  registered = false;
  try {
    if (!Device.isDevice) return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) await supabase.from("push_tokens").delete().eq("user_id", userId).eq("token", token);
  } catch {
    /* ignore */
  }
}
