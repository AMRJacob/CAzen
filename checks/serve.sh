#!/bin/sh
# Build CAzen against a stand-in backend and serve it on :4173. Nothing here touches the real database.
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.." && VITE_SUPABASE_URL=https://stand-in.supabase.co VITE_SUPABASE_ANON_KEY=anon npx vite build --outDir "$here/dist" --emptyOutDir >/dev/null 2>&1
cd "$here" && (pkill -f "http.server 4173" ; true) && (nohup python3 -m http.server 4173 -d dist >/dev/null 2>&1 &) ; sleep 1
