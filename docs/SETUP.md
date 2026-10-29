# Setup guide

About 30 minutes, one time. You need a GitHub account and a Supabase account (both can use your existing email).

## 1. Create the GitHub repository

1. Sign in at github.com → **New repository**.
2. Name: `cazen`. Leave "Add a README" **unchecked** (this package already has one).
3. Visibility — pick one:
   - **Public**: free hosting on GitHub Pages. Only code is public; project documents live in Supabase behind a login. Nothing in this repo is confidential (keys stay in `.env` / GitHub Secrets).
   - **Private**: GitHub Pages from a private repo needs a paid GitHub plan (Pro or Team). On the free plan, host the app on Vercel or Netlify instead (step 4b).
4. Push this folder (from a terminal in the unzipped folder):

```bash
git init
git add .
git commit -m "Initial scaffold: app, schema, CI"
git branch -M main
git remote add origin https://github.com/<your-username>/cazen.git
git push -u origin main
```

Or tell Claude the repo name once it exists, and Claude can push it for you.

## 2. Create the Supabase project

1. supabase.com → **New project**. Name `cazen`, pick a strong database password, region closest to Arkansas (US East / US Central).
2. **SQL Editor** → paste all of `supabase/migrations/0001_init.sql` → **Run**. This creates the tables, the revision-history rules, the private storage buckets and the access policies.
3. **Authentication → Providers**: keep Email enabled. Turn **off** "Allow new users to sign up" so only people you invite can log in.
4. **Authentication → Users → Invite user**: invite yourself.
5. **Project Settings → API**: copy the Project URL and the `anon` public key.

## 3. Run it on your computer

Requires Node.js 22+ (nodejs.org).

```bash
cp .env.example .env      # then paste the URL and anon key into .env
npm install
npm run dev               # opens http://localhost:5173
```

## 4. Put it online

**4a. GitHub Pages (public repo, or paid GitHub plan)**
1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Repo → Settings → Secrets and variables → Actions → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Push to `main`. The `Deploy to GitHub Pages` workflow publishes the site.

**4b. Vercel or Netlify (private repo on the free GitHub plan)**
Import the repo, set the same two environment variables, build command `npm run build`, output folder `dist`.

## 5. Add the AMR branding

Drop the letterhead and titleblock PDFs into `templates/` (see `templates/README.md`).

## What's safe to commit

- Safe: everything in this repo, including the `anon` key in GitHub Secrets (it only works within the access policies).
- Never commit: `.env`, the Supabase `service_role` key, the database password, or any project PDFs.
