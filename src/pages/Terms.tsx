import { Link } from "react-router-dom";
import { Zap, ArrowLeft } from "lucide-react";

const Terms = () => {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: February 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/90 leading-relaxed">
          {/* 1. Acceptance */}
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of terms</h2>
            <p>
              By accessing or using ZuckerBot ("the Service"), operated by DatalisHQ ("we", "us",
              "our"), you agree to be bound by these Terms of Service. If you don't agree, please
              don't use the Service.
            </p>
            <p className="mt-2">
              We may update these terms from time to time. Continued use of the Service after
              changes are posted means you accept the updated terms.
            </p>
          </section>

          {/* 2. Service description */}
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Service description</h2>
            <p>
              ZuckerBot is an AI-powered platform that helps Australian tradespeople create and
              manage Facebook advertising campaigns. Our Service includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>AI-generated ad copy tailored to your trade and service area.</li>
              <li>Campaign creation and management via the Meta (Facebook) Marketing API.</li>
              <li>A lead inbox to view and manage enquiries from your ads.</li>
              <li>Automated SMS notifications to leads via Twilio.</li>
              <li>Campaign performance tracking and analytics.</li>
            </ul>
            <p className="mt-3">
              We act as a tool to help you run ads. We do not guarantee any specific results,
              lead volumes, or return on ad spend. Advertising performance depends on many factors
              outside our control, including your trade, location, budget, and market conditions.
            </p>
          </section>

          {/* 3. Account responsibilities */}
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Account responsibilities</h2>
            <p>To use ZuckerBot, you must:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Be at least 18 years old.</li>
              <li>Provide accurate and complete information when creating your account.</li>
              <li>Keep your login credentials secure and not share them with others.</li>
              <li>
                Have a valid Facebook account and the authority to run ads on the connected
                Facebook Page and ad account.
              </li>
              <li>
                Comply with Meta's Advertising Policies and Community Standards when using our
                Service.
              </li>
            </ul>
            <p className="mt-3">
              You are responsible for all activity that occurs under your account. If you suspect
              unauthorised access, contact us immediately.
            </p>
          </section>

          {/* 4. Billing and payments */}
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Billing and payments</h2>
            <p>
              ZuckerBot operates on a subscription model. Payments are processed securely through
              Stripe.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                Your subscription fee covers access to the ZuckerBot platform. Facebook ad spend
                is charged separately by Meta directly to your linked payment method in Ads Manager.
              </li>
              <li>
                Subscriptions renew automatically each billing cycle unless you cancel before the
                renewal date.
              </li>
              <li>
                We may offer free trials. If you don't cancel before the trial ends, you'll be
                charged for the next billing period.
              </li>
              <li>
                Refunds are handled on a case-by-case basis. Contact us if you believe you've been
                charged in error.
              </li>
              <li>
                We reserve the right to change pricing with reasonable notice. Existing subscribers
                will be notified before any price changes take effect.
              </li>
            </ul>
          </section>

          {/* 5. Facebook/Meta integration */}
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Facebook / Meta integration</h2>
            <p>
              By connecting your Facebook account to ZuckerBot, you authorise us to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Access your Facebook Page and ad account information.</li>
              <li>Create, edit, pause, and manage ad campaigns on your behalf.</li>
              <li>Retrieve lead form data and campaign performance metrics.</li>
            </ul>
            <p className="mt-3">
              You can revoke this access at any time by disconnecting your Facebook account in
              your ZuckerBot settings or through Facebook's app permissions.
            </p>
            <p className="mt-2">
              We are not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.
              Facebook and Meta are trademarks of Meta Platforms, Inc. Your use of Facebook's
              services is subject to Meta's own terms and policies.
            </p>
          </section>

          {/* 6. AI-generated content */}
          <section>
            <h2 className="text-xl font-semibold mb-3">6. AI-generated content</h2>
            <p>
              Our Service uses artificial intelligence (powered by Anthropic) to generate ad copy
              and campaign suggestions. While we strive for quality:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                AI-generated content is provided as suggestions. You are responsible for reviewing
                and approving all ad content before it goes live.
              </li>
              <li>
                We do not guarantee that AI-generated content will comply with all advertising
                regulations or be suitable for your specific situation.
              </li>
              <li>
                You retain responsibility for ensuring your ads are truthful, not misleading, and
                comply with Australian Consumer Law and Meta's advertising policies.
              </li>
            </ul>
          </section>

          {/* 7. Intellectual property */}
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Intellectual property</h2>
            <p>
              The ZuckerBot platform, including its design, code, AI models, branding, and
              documentation, is owned by DatalisHQ and protected by intellectual property laws.
            </p>
            <p className="mt-2">
              Content you provide (business details, photos, descriptions) remains yours. By
              uploading content to our platform, you grant us a licence to use it for the purpose
              of delivering the Service (e.g., including your photos in Facebook ads).
            </p>
            <p className="mt-2">
              Ad copy generated by our AI for your campaigns may be used by you freely for your
              business advertising purposes.
            </p>
          </section>

          {/* 8. Limitation of liability */}
          <section>
            <h2 className="text-xl font-semibold mb-3">8. Limitation of liability</h2>
            <p>To the maximum extent permitted by Australian law:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                ZuckerBot is provided "as is" without warranties of any kind, whether express or
                implied.
              </li>
              <li>
                We are not liable for any indirect, incidental, consequential, or punitive damages
                arising from your use of the Service.
              </li>
              <li>
                Our total liability to you for any claims arising from the Service is limited to
                the amount you paid us in the 12 months preceding the claim.
              </li>
              <li>
                We are not responsible for actions taken by Meta, including ad account
                suspensions, policy violations, or changes to the Facebook advertising platform.
              </li>
              <li>
                We are not liable for the quality, accuracy, or outcome of leads generated through
                your ad campaigns.
              </li>
            </ul>
            <p className="mt-3">
              Nothing in these terms excludes or limits any rights you have under the Australian
              Consumer Law that cannot be excluded or limited by contract.
            </p>
          </section>

          {/* 9. Termination */}
          <section>
            <h2 className="text-xl font-semibold mb-3">9. Termination</h2>
            <p>
              You can cancel your subscription and close your account at any time from your
              account settings or by contacting us.
            </p>
            <p className="mt-2">We may suspend or terminate your account if you:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Breach these terms or Meta's advertising policies.</li>
              <li>Use the Service for fraudulent, illegal, or misleading purposes.</li>
              <li>Fail to pay your subscription fees.</li>
              <li>Abuse the platform or other users.</li>
            </ul>
            <p className="mt-3">
              On termination, your access to the platform will cease. Active ad campaigns will be
              paused. Your data will be handled in accordance with our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          {/* 10. Governing law */}
          <section>
            <h2 className="text-xl font-semibold mb-3">10. Governing law</h2>
            <p>
              These terms are governed by and construed in accordance with the laws of the
              Commonwealth of Australia. Any disputes arising from these terms or the Service will
              be subject to the exclusive jurisdiction of the courts of Australia.
            </p>
          </section>

          {/* 11. Contact */}
          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact us</h2>
            <p>If you have questions about these terms, contact us at:</p>
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

export default Terms;
