import { Link } from "react-router-dom";
import { Zap, ArrowLeft } from "lucide-react";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ZuckerBot</span>
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 py-12 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: February 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/90 leading-relaxed">
          {/* Intro */}
          <section>
            <p>
              ZuckerBot ("we", "us", "our") is operated by DatalisHQ. We provide an AI-powered
              Facebook advertising platform for small businesses at{" "}
              <a href="https://zuckerbot.ai" className="text-primary hover:underline">
                zuckerbot.ai
              </a>
              . This policy explains what data we collect, how we use it, and your rights.
            </p>
            <p>
              We're committed to complying with the Australian Privacy Act 1988 (Cth), the
              Australian Privacy Principles (APPs), and applicable international privacy laws
              including the GDPR (for EU/UK users) and the CCPA (for California residents).
            </p>
          </section>

          {/* 1. What we collect */}
          <section>
            <h2 className="text-xl font-semibold mb-3">1. What data we collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Account information</strong> — your name, email address, phone number, and
                password when you sign up.
              </li>
              <li>
                <strong>Business details</strong> — your business type, business name, service area,
                and any photos or descriptions you provide for ad creation.
              </li>
              <li>
                <strong>Facebook ad account data</strong> — when you connect your Facebook account,
                we access your ad account ID, page information, and campaign performance data
                (impressions, clicks, spend, leads) via the Meta Marketing API.
              </li>
              <li>
                <strong>Lead data</strong> — information submitted by people who respond to your
                ads, including their name, phone number, email, and any form responses.
              </li>
              <li>
                <strong>Billing information</strong> — payment details are collected and processed
                by Stripe. We do not store your full credit card number.
              </li>
              <li>
                <strong>Usage data</strong> — how you interact with our platform, including pages
                visited, features used, and device/browser information.
              </li>
            </ul>
          </section>

          {/* 2. How we use it */}
          <section>
            <h2 className="text-xl font-semibold mb-3">2. How we use your data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To create, launch, and manage Facebook ad campaigns on your behalf.</li>
              <li>
                To send automated SMS messages to your leads via Twilio (e.g., confirming their
                enquiry).
              </li>
              <li>To generate AI-powered ad copy tailored to your business type and location.</li>
              <li>To display leads in your inbox and send you notifications.</li>
              <li>To process payments and manage your subscription.</li>
              <li>To improve our platform, AI models, and ad performance.</li>
              <li>To communicate with you about your account and our services.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          {/* 3. Third parties */}
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Third parties we share data with</h2>
            <p>
              We share your data with the following service providers, solely to deliver our
              service:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Meta (Facebook)</strong> — to create and deliver your ad campaigns. Your
                business details and ad content are sent to Meta's advertising platform.
              </li>
              <li>
                <strong>Twilio</strong> — to send SMS messages to your leads. Lead phone numbers
                and message content are shared with Twilio.
              </li>
              <li>
                <strong>Stripe</strong> — to process subscription payments. Your billing details
                are handled directly by Stripe.
              </li>
              <li>
                <strong>Supabase</strong> — to securely store your account data, campaign
                information, and lead records.
              </li>
              <li>
                <strong>Anthropic</strong> — to power our AI-generated ad copy. Business details
                and business information may be sent to Anthropic's API for content generation.
              </li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information to third parties. We do not share your data
              with anyone beyond what's described above.
            </p>
          </section>

          {/* 4. Data retention */}
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data retention and deletion</h2>
            <p>
              We retain your account data and campaign history for as long as your account is
              active. Lead data is retained for up to 12 months after collection, unless you
              request earlier deletion.
            </p>
            <p className="mt-2">
              If you close your account, we will delete your personal data within 30 days, except
              where we are required to retain it for legal or regulatory purposes (e.g., billing
              records may be kept for up to 7 years for tax compliance).
            </p>
            <p className="mt-2">
              To request deletion of your data, email us at{" "}
              <a href="mailto:copernicus913@gmail.com" className="text-primary hover:underline">
                copernicus913@gmail.com
              </a>
              .
            </p>
          </section>

          {/* 5. Australian Privacy Act */}
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Privacy law compliance</h2>
            <p>
              We handle personal information in accordance with the Australian Privacy Act 1988 (Cth),
              the 13 Australian Privacy Principles, and applicable international privacy laws. You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate or out-of-date information.</li>
              <li>Request deletion of your personal information.</li>
              <li>
                <strong>Australian users:</strong> Complain to the Office of the Australian Information
                Commissioner (OAIC) if you believe we have breached the APPs.
              </li>
              <li>
                <strong>EU/UK users:</strong> Exercise your rights under the GDPR, including the right to
                data portability, the right to restrict processing, and the right to lodge a complaint
                with your local data protection authority.
              </li>
              <li>
                <strong>California residents:</strong> Exercise your rights under the CCPA, including the
                right to know, delete, and opt out of the sale of personal information. We do not sell
                your personal information.
              </li>
            </ul>
            <p className="mt-3">
              Some data may be processed overseas by our third-party providers (e.g., Meta, Stripe,
              Anthropic, and Twilio operate infrastructure internationally). We take reasonable
              steps to ensure these providers comply with equivalent privacy standards.
            </p>
          </section>

          {/* 6. Cookies */}
          <section>
            <h2 className="text-xl font-semibold mb-3">6. Cookies and tracking</h2>
            <p>We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Keep you signed in to your account.</li>
              <li>Remember your preferences.</li>
              <li>
                Track ad performance via the Meta Pixel (only when you grant consent).
              </li>
              <li>Understand how our platform is used so we can improve it.</li>
            </ul>
            <p className="mt-3">
              You can control cookies through your browser settings. Disabling cookies may affect
              some platform functionality.
            </p>
          </section>

          {/* 7. Security */}
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security</h2>
            <p>
              We take reasonable steps to protect your data from unauthorised access, loss, or
              misuse. This includes encryption in transit (HTTPS), secure authentication, and
              access controls on our database. However, no method of electronic storage or
              transmission is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* 8. Changes */}
          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to this policy</h2>
            <p>
              We may update this privacy policy from time to time. If we make material changes,
              we'll notify you by email or through a notice on our platform. Your continued use of
              ZuckerBot after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* 9. Contact */}
          <section>
            <h2 className="text-xl font-semibold mb-3">9. Contact us</h2>
            <p>
              If you have questions about this policy or want to exercise your privacy rights,
              contact us at:
            </p>
            <p className="mt-2">
              <strong>DatalisHQ</strong>
              <br />
              Email:{" "}
              <a href="mailto:copernicus913@gmail.com" className="text-primary hover:underline">
                copernicus913@gmail.com
              </a>
              <br />
              Website:{" "}
              <a href="https://zuckerbot.ai" className="text-primary hover:underline">
                zuckerbot.ai
              </a>
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-x-4">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <span>·</span>
          <span>© 2026 ZuckerBot</span>
        </div>
      </footer>
    </div>
  );
};

export default Privacy;
