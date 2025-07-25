import { Navbar } from "@/components/Navbar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQ() {
  const faqs = [
    {
      question: "What is ZuckerBot?",
      answer: "ZuckerBot is an AI-powered assistant specifically designed to help you create, optimize, and manage Meta (Facebook/Instagram) advertising campaigns. It provides expert guidance on ad copy, targeting, budget optimization, and campaign strategy."
    },
    {
      question: "How does the conversation limit work?",
      answer: "Each plan has a monthly conversation limit. A conversation includes both your message and ZuckerBot's response. Free users get 5 conversations per month, Pro users get 100, and Agency users have unlimited conversations."
    },
    {
      question: "Can I upgrade or downgrade my plan anytime?",
      answer: "Yes! You can upgrade or downgrade your subscription at any time through your account dashboard. Changes will be prorated and take effect at your next billing cycle."
    },
    {
      question: "What happens if I exceed my conversation limit?",
      answer: "If you reach your monthly conversation limit, you'll need to either upgrade your plan or wait until the next billing cycle. We'll send you notifications as you approach your limit."
    },
    {
      question: "Do you offer refunds?",
      answer: "We offer a 14-day free trial for all paid plans. After that, we provide prorated refunds for unused portions of annual subscriptions within 30 days of purchase."
    },
    {
      question: "Is my data secure?",
      answer: "Absolutely. We use enterprise-grade security measures to protect your data. All communications are encrypted, and we never share your advertising data with third parties."
    },
    {
      question: "What types of Meta ads can ZuckerBot help with?",
      answer: "ZuckerBot can assist with all types of Meta advertising including Facebook and Instagram ads, Stories, Reels, video ads, carousel ads, lead generation campaigns, and more."
    },
    {
      question: "Can ZuckerBot integrate with my Facebook Ads Manager?",
      answer: "Currently, ZuckerBot provides strategic guidance and recommendations. Direct integration with Facebook Ads Manager is planned for future releases."
    },
    {
      question: "What's included in the Agency plan?",
      answer: "The Agency plan includes unlimited conversations, support for multiple business accounts, competitor analysis tools, white-label options, agency reporting features, and a dedicated account manager."
    },
    {
      question: "How do I cancel my subscription?",
      answer: "You can cancel your subscription anytime through your account settings or by contacting our support team. Your access will continue until the end of your current billing period."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
            <p className="text-xl text-muted-foreground">
              Everything you need to know about ZuckerBot
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6">
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center">
            <h3 className="text-xl font-semibold mb-4">Still have questions?</h3>
            <p className="text-muted-foreground mb-6">
              Can't find the answer you're looking for? Our support team is here to help.
            </p>
            <a 
              href="mailto:support@zuckerbot.ai" 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}