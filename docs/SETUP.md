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

1. **SQL Editor** → run `0002_phase1.sql`, `0003_firms.sql`, then `0004_hardening.sql` from `supabase/migrations/`, in that order. (Already applied to the CAzen project.)
2. **Authentication → URL Configuration**:
   - Site URL: `https://amrjacob.github.io/CAzen/`
   - Redirect URLs: add `https://amrjacob.github.io/CAzen/` and `http://localhost:5173/`
3. **Authentication → Users → Add user → Create new user**: enter your email and a password, tick **Auto Confirm User**. This is the quickest way in; email sign-in links also work once step 2 is done.

### Inviting people

**Authentication → Users → Add user → Send invitation**. The person clicks the link in the email, lands on CAzen,
and is asked to **create a password** before anything else. After that they sign in with email + password.
Anyone who forgets can use **Forgot password?** on the sign-in screen; the reset link opens the same screen.

Invite and reset links only work after step 2 (Site URL) is set.

**Email limits on the free plan.** Supabase's built-in email only delivers to members of your Supabase
organization and sends at most 2 auth emails per hour for the whole project (invites, sign-in links and
resets combined). For testing, create users with a password instead (Add user → Create new user →
Auto Confirm). Before inviting coworkers, connect your own email sender under
**Authentication → Emails → SMTP Settings**. That removes both limits and lets you edit the email templates.

**Once custom SMTP is on (optional):** if invite links show "expired" as soon as they're clicked, a work email
scanner may be using up the one-time link. In **Authentication → Emails → Templates**:

- **Invite user**: link to `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=invite`
- **Reset password**: link to `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery`

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

## File storage: Cloudflare R2 (prototype)

CAzen keeps drawings, forms and photos in a private Cloudflare R2 bucket. The browser never sees
the Cloudflare key: the Supabase Edge Function `files` (in `supabase/functions/files`) checks the
user is a member of the project and hands out 15-minute links for one file at a time.
Free allowance: 10 GB of storage a month, no download fees (https://developers.cloudflare.com/r2/pricing).

1. **Cloudflare account.** Sign up at dash.cloudflare.com, open **R2 Object Storage** and enable it.
   Cloudflare may ask for a card even on the free plan; nothing is charged within the free allowance.
2. **Bucket.** Create a bucket named `cazen-files` (location: Automatic). Leave public access off.
3. **CORS.** In the bucket's **Settings → CORS policy**, add:
   ```json
   [
     {
       "AllowedOrigins": ["https://amrjacob.github.io", "http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **API token.** In R2, **Manage API tokens → Create API token**: permission **Object Read & Write**,
   applied to the `cazen-files` bucket only. Keep the page open: it shows the **Access Key ID** and
   **Secret Access Key** once. Your **Account ID** is on the R2 overview page (also inside the S3
   endpoint, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
5. **Supabase secrets.** In the Supabase dashboard for CAzen, **Edge Functions → Secrets**, add:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` = `cazen-files`.
   Paste the keys there only: never into the repo, a chat, or `.env` files that get committed.
6. **Check.** Open CAzen → Drawings. The bar should say "Files are saved in CAzen file storage".
   If it says file storage isn't set up yet, recheck the four secret names.

New projects use R2 by default. Existing projects show **Use CAzen file storage** on the Drawings page.
On an office computer (Chrome or Edge), **Keep copies in the project folder** also writes every file
into the project's CA folder (`CAzen\01 Contract … 11 Pay Applications`), and **Copy to project folder**
catches up on files saved elsewhere, such as from a phone.

Moving off the free allowance later: R2's paid storage is $0.015 per GB-month; nothing in CAzen changes.
