# Tailor.ai — AI-Powered Resume Tailor

An AI-powered SaaS that tailors your resume and generates a cover letter for any job posting in seconds. Provides ATS compatibility scoring, keyword matching, and exports to PDF or DOCX.

---

## Features

- **AI Resume Tailoring** — Rewrites your resume to match a specific job description, optimised for ATS parsing
- **Cover Letter Generation** — Produces a personalised cover letter alongside every tailored resume
- **ATS Score** — Shows a compatibility percentage and matched keyword tags for the job
- **Multiple Export Formats** — Download tailored resume and cover letter as PDF or DOCX
- **Master Resume Mode** — Upload a base resume once; it's stored and reused across sessions
- **Generation History** — Browse past generations with job title, company, and ATS score
- **Token System** — Pay-per-use credits (INR 250 for 10 tokens); new users get 3 free tokens
- **Authentication** — Google OAuth and Magic Link via Supabase Auth
- **Payments** — Razorpay integration with webhook-driven token top-up

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4, lucide-react icons |
| AI | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Auth + DB | Supabase (PostgreSQL + RLS + Storage) |
| Payments | Razorpay |
| PDF Output | jsPDF |
| DOCX Output | docx (npm package) |
| Resume Parsing | pdf-parse (PDF input), mammoth (DOCX input) |
| XSS Sanitisation | isomorphic-dompurify |
| Deployment | Vercel |

---

## Project Structure

```
ats-resume-tailor/
├── app/
│   ├── AppClient.tsx          # Entire frontend (~780 lines, single-page architecture)
│   ├── layout.tsx             # Root layout with SEO metadata
│   ├── page.tsx               # Thin shell — dynamic imports AppClient (ssr: false)
│   ├── sitemap.ts             # Next.js sitemap
│   ├── robots.ts              # Next.js robots.txt
│   └── api/
│       ├── generate/          # Core tailoring endpoint (deducts token, calls Gemini, saves to DB)
│       ├── parse-resume/      # Extracts text from uploaded PDF/DOCX
│       ├── download/          # Generates + streams PDF or DOCX
│       ├── leads/             # Email capture for non-authenticated visitors
│       ├── payment/
│       │   └── create-order/  # Creates a Razorpay order
│       └── webhooks/
│           └── razorpay/      # Verifies payment + credits tokens via SQL RPC
├── lib/
│   ├── gemini.ts              # Gemini prompt, GenerationResult interface
│   ├── pdf.ts                 # PDF generation from markdown (jsPDF)
│   ├── docx.ts                # DOCX generation from markdown (docx package)
│   └── supabase/
│       ├── client.ts          # Browser Supabase client
│       └── server.ts          # Server Supabase client (uses cookies)
└── next.config.ts             # serverExternalPackages for pdf-parse, mammoth, docx
```

---

## Database Schema

Three tables managed in Supabase Dashboard:

```sql
-- Users table (extends auth.users)
users (id uuid PK, email text, tokens int, master_resume_path text, master_resume_text text, created_at timestamptz)

-- Generation history
generations (id uuid PK, user_id uuid FK, tailored_resume text, cover_letter text, job_description text, job_title text, company_name text, ats_score int, matched_keywords text[], created_at timestamptz)

-- Payment records
transactions (id uuid PK, user_id uuid FK, razorpay_order_id text, razorpay_payment_id text, amount int, tokens_added int, status text, created_at timestamptz)

-- Email capture
leads (id uuid PK, email text UNIQUE, created_at timestamptz)
```

### SQL RPCs (run in Supabase SQL Editor)

```sql
-- Atomic token deduction (prevents race conditions)
CREATE OR REPLACE FUNCTION deduct_token(uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users SET tokens = tokens - 1 WHERE id = uid AND tokens > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_tokens'; END IF;
END;
$$;

-- Atomic token credit (called by payment webhook)
CREATE OR REPLACE FUNCTION add_tokens(uid uuid, amount int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users SET tokens = tokens + amount WHERE id = uid;
END;
$$;

-- Auto-create user row on signup with 3 free tokens
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, tokens) VALUES (NEW.id, NEW.email, 3)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Razorpay
RAZORPAY_KEY_ID=your-key-id
RAZORPAY_KEY_SECRET=your-key-secret
NEXT_PUBLIC_RAZORPAY_KEY_ID=your-key-id

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Supabase Setup

1. **Auth** — Enable Google OAuth and Magic Link in Authentication > Providers
2. **Storage** — Create a bucket named `resumes` with the following RLS policy:

   ```sql
   -- Allow users to manage only their own folder
   CREATE POLICY "User owns their folder" ON storage.objects
   FOR ALL USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

3. **Tables** — Create the schema above via the SQL Editor
4. **RPCs** — Run all four SQL functions above

---

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Build & Deploy

```bash
npm run build
```

Deploy to Vercel by connecting the repository. All environment variables must be set in the Vercel project settings.

For Razorpay webhooks, set the webhook URL to:
```
https://your-domain.com/api/webhooks/razorpay
```

---

## How It Works

1. User uploads their resume (PDF or DOCX) — text is extracted server-side
2. User pastes a job description and clicks **Craft**
3. One token is deducted atomically via a PostgreSQL RPC
4. Gemini 2.5 Flash rewrites the resume, generates a cover letter, and returns an ATS score + matched keywords
5. Results are saved to the `generations` table
6. User can download the tailored resume or cover letter as **PDF** or **DOCX**

---

## Architecture Notes

- The entire frontend lives in a single file (`app/AppClient.tsx`) — no component library, no custom hooks, no separate pages
- `page.tsx` wraps `AppClient` with `dynamic(..., { ssr: false })` to prevent hydration errors from inline `<style>` tags
- PDF and DOCX generation both parse the same markdown format returned by Gemini
- Token operations use `SECURITY DEFINER` RPCs to prevent client-side race conditions
- AI content is sanitised with DOMPurify before being rendered via `dangerouslySetInnerHTML`
- API calls use a 45-second `AbortController` timeout with a user-facing retry button on failure
