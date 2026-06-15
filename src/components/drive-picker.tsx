"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Btn } from "@/lib/ui";

/* Google Drive Picker — "choose from Drive" with account linking.
   Requires (set in Vercel + .env.local):
     NEXT_PUBLIC_GOOGLE_CLIENT_ID  — OAuth Client ID (Web application)
     NEXT_PUBLIC_GOOGLE_API_KEY    — API key with Picker API enabled
   Uses the drive.file scope: the app can only read files the user picks,
   so no Google verification review is needed. The button renders only
   when both env vars are present. */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PICK_MIMES = [SHEET_MIME, XLSX_MIME, "application/vnd.ms-excel", "text/csv"].join(",");

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(el);
      }),
    );
  }
  return loaded.get(src)!;
}

async function getAccessToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (res: { access_token?: string; error?: string }) => {
        if (res.access_token) resolve(res.access_token);
        else reject(new Error(res.error ?? "Google sign-in was cancelled"));
      },
    });
    tc.requestAccessToken();
  });
}

export default function DrivePickerBtn({
  onFiles,
  onError,
}: {
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  if (!CLIENT_ID || !API_KEY) return null;

  const open = async () => {
    setBusy(true);
    try {
      const [token] = await Promise.all([
        getAccessToken(),
        loadScript("https://apis.google.com/js/api.js").then(
          () => new Promise<void>((res) => window.gapi.load("picker", () => res())),
        ),
      ]);

      const docs = await new Promise<{ id: string; name: string; mimeType: string }[]>(
        (resolve) => {
          const picker = new window.google.picker.PickerBuilder()
            .setOAuthToken(token)
            .setDeveloperKey(API_KEY)
            .setAppId(CLIENT_ID!.split("-")[0])
            .addView(new window.google.picker.DocsView().setMimeTypes(PICK_MIMES))
            .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
            .setCallback((data: any) => {
              if (data.action === window.google.picker.Action.PICKED) resolve(data.docs ?? []);
              else if (data.action === window.google.picker.Action.CANCEL) resolve([]);
            })
            .build();
          picker.setVisible(true);
        },
      );
      if (!docs.length) return;

      const files: File[] = [];
      for (const doc of docs) {
        const isSheet = doc.mimeType === SHEET_MIME;
        const url = isSheet
          ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`
          : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Drive download failed for "${doc.name}" (${res.status})`);
        const buf = await res.arrayBuffer();
        files.push(
          new File([buf], isSheet && !doc.name.endsWith(".xlsx") ? `${doc.name}.xlsx` : doc.name),
        );
      }
      onFiles(files);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Google Drive picker failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Btn variant="soft" onClick={open} busy={busy} busyLabel="…">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8.3 3h7.4l6 10.5-3.7 6.5H6L2.3 13.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8.3 3 12 9.6 6 20M15.7 3l-7.4 13h13.4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>{" "}
      {t("reports.drive_pick")}
    </Btn>
  );
}
