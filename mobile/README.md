# Swift Money Transfer — Mobile (Expo)

Native app for all three roles (Distributor, FOS, Retailer), sharing the same Supabase backend as the web app.

## Stack

- Expo SDK 54 + Expo Router 6
- React Native 0.81, React 19
- NativeWind v4 (Tailwind on RN)
- @supabase/supabase-js with AsyncStorage session persistence
- TypeScript strict

## Setup

```bash
cd mobile
cp .env.example .env
# paste the same SUPABASE URL + anon key your web app uses, with the EXPO_PUBLIC_ prefix
npx expo start
```

Then either:
- **Phone**: Install **Expo Go** from the App Store / Play Store, scan the QR code printed in the terminal.
- **iOS Simulator** (macOS): press `i` in the Expo dev terminal. Requires Xcode + a simulator already running.
- **Android Emulator**: press `a`. Requires Android Studio + an AVD.

## What works

| Role | Screens |
|---|---|
| **Distributor** | Overview · Approvals (money + cash) · Outstanding · Users (read-only) · EOD (web-only message) |
| **FOS** | Overview · Inbox (accept/edit/decline) · Submit cash on retailer's behalf · My retailers |
| **Retailer** | Overview · Request money · Submit cash · Daily history + transactions |

## What's intentionally web-only

- **Create FOS / retailer** (uses service-role key, can't be exposed to mobile)
- **EOD CSV/XLSX upload** (file picker + atomic parse — easier on a desktop)

Both are flagged in the Users + EOD tabs with a "Use the web app" message.

## File layout

```
mobile/
├── app/                  # Expo Router file-based routes
│   ├── _layout.tsx       # root: AuthProvider + StatusBar
│   ├── index.tsx         # role-based redirect
│   ├── login.tsx
│   ├── (distributor)/    # role-grouped routes (parens = no URL segment)
│   ├── (fos)/
│   └── (retailer)/
├── components/           # Button, Input, Card, Badge, Empty, Field, Stat, Screen, RoleGate
├── lib/
│   ├── supabase.ts       # createClient + AsyncStorage + AppState refresh
│   ├── auth.tsx          # AuthProvider context + useAuth hook
│   ├── queries.ts        # typed read queries
│   ├── api.ts            # mutations (create/decide/submit)
│   ├── types.ts
│   └── format.ts         # formatINR, formatDate, formatDateTime
├── tailwind.config.js
├── babel.config.js
├── metro.config.js
└── global.css
```

## Auth model

- Distributor-issued credentials only (same as web).
- On sign-in, the mobile auth context fetches the user's `profiles` row.
- The `RoleGate` component wraps each role group's `_layout.tsx` and redirects users away from the wrong role's screens.
- Sessions persist via `AsyncStorage`. Token auto-refresh is paused when the app is backgrounded (saves battery / network).
