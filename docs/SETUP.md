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

### 2b. Phase 1 settings

1. **SQL Editor** → paste all of `supabase/migrations/0002_phase1.sql` → **Run**.
2. **Authentication → URL Configuration**:
   - Site URL: `https://amrjacob.github.io/CAzen/`
   - Redirect URLs: add `https://amrjacob.github.io/CAzen/` and `http://localhost:5173/`
3. **Authentication → Users → Add user → Create new user**: enter your email and a password, tick **Auto Confirm User**. This is the quickest way in; email sign-in links also work once step 2 is done.

### Inviting people

**Authentication → Users → Add user → Send invitation**. The person clicks the link in the email, lands on CAzen,
and is asked to **create a password** before anything else. After that they sign in with email + password.
Anyone who forgets can use **Forgot password?** on the sign-in screen; the reset link opens the same screen.

Invite and reset links only work after step 2 (Site URL) is set.

**Optional, if invite links show "expired" right away:** some work email systems open links to scan them,
which uses up a one-time link before the person clicks it. Changing the email templates so CAzen does the
verification avoids that. In **Authentication → Emails → Templates**:

- **Invite user**: replace the link with
  `<a href="{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=invite">Accept invite and create your password</a>`
- **Reset password**: replace the link with
  `<a href="{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`

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
