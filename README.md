# ZuckerBot v2

AI-powered Facebook ads for Aussie tradies. Tell us your trade, we create and launch your ad, and send you the leads.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (Auth, DB, Edge Functions, Storage)
- **Payments**: Stripe
- **Ads**: Meta Marketing API
- **SMS**: Twilio
- **AI**: Claude API (ad copy generation)

## Getting Started

```sh
git clone https://github.com/DatalisHQ/zuckerbot-d2fa8661.git
cd zuckerbot-d2fa8661
npm install
npm run dev
```

## Environment Variables

Set these in your Supabase Edge Function secrets:

```
ANTHROPIC_API_KEY=your_key
STRIPE_SECRET_KEY=your_key
STRIPE_WEBHOOK_SECRET=your_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number
```

Frontend Supabase config is in `src/integrations/supabase/client.ts`.

## Deployment

Deployed via Vercel. Pushes to `main` trigger production deploys.
