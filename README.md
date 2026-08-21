This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Firebase Admin credentials

Server-side administrative routes use Firebase Admin with Application Default
Credentials. In local development, set `GOOGLE_APPLICATION_CREDENTIALS` to the
absolute path of a service-account JSON file for `proveit-internal` before
starting the server. Keep that file outside this repository; it must never be
committed or exposed through `NEXT_PUBLIC_*` variables.

Deployed environments should use their platform-provided workload identity or
service account rather than bundling a service-account JSON file. The identity
must be authorized to verify revoked Firebase ID tokens and access the required
Firebase Auth and Firestore resources.

### Meeting intelligence providers

Meeting intelligence is optional and fails closed when its providers are not
configured. Configure Whisper with either the exact OpenAI-compatible endpoint
in `WHISPER_API_URL`, or a service root in `WHISPER_BASE_URL` (the application
appends `/v1/audio/transcriptions`). `WHISPER_API_KEY`, `WHISPER_MODEL`, and
`WHISPER_TIMEOUT_MS` are optional for local/private deployments.

Configure Ollama with `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
`OLLAMA_TIMEOUT_MS` is optional. All of these variables are server-only and
must never use a `NEXT_PUBLIC_` prefix.

Raw Whisper transcripts and structured Ollama results are stored in the
server-owned `meetingIntelligence` collection. They remain separate from the
human-editable `meetings.notes` and `meetings.transcript` fields. Analysis only
proposes action items; creating tasks requires a separate explicit approval.

### Transactional email and reminders

Transactional email is optional and remains server-only. Configure Resend with
`RESEND_API_KEY` and `RESEND_FROM_EMAIL`, and set `PROVEIT_APP_URL` to the
canonical HTTPS application origin used for notification links. When any
required value is absent, ProveIt records delivery as unavailable and never
reports a successful send.

The bounded reminder dispatcher is exposed at `GET` or `POST
/api/internal/reminders`. Protect it with `REMINDER_DISPATCH_SECRET` and invoke
it from the deployment scheduler with the same value in the `Authorization:
Bearer …` header. The endpoint is disabled with a 503 response when the secret
is not configured. These variables must never use a `NEXT_PUBLIC_` prefix.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
