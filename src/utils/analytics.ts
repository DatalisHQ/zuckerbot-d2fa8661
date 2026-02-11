// Google Analytics 4 utility functions
// Handles GA4 event tracking with proper error handling and development mode detection

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

/**
 * Check if GA4 is properly initialized and not in development mode
 */
const isGA4Available = (): boolean => {
  // Don't track in development mode
  if (import.meta.env.DEV) {
    console.log('[Analytics] Tracking disabled in development mode');
    return false;
  }

  // Check if GA4 measurement ID is configured
  if (!import.meta.env.VITE_GA4_MEASUREMENT_ID) {
    console.warn('[Analytics] GA4 measurement ID not configured');
    return false;
  }

  // Check if gtag is loaded
  if (typeof window === 'undefined' || !window.gtag) {
    console.warn('[Analytics] GA4 gtag not loaded');
    return false;
  }

  return true;
};

/**
 * Track a custom event with optional parameters
 */
export const trackEvent = (eventName: string, parameters?: Record<string, any>): void => {
  if (!isGA4Available()) return;

  try {
    console.log(`[Analytics] Tracking event: ${eventName}`, parameters);
    window.gtag('event', eventName, parameters);
  } catch (error) {
    console.error('[Analytics] Error tracking event:', error);
  }
};

/**
 * Track conversion/purchase events with value
 */
export const trackConversion = (value: number, currency = 'AUD', transactionId?: string): void => {
  if (!isGA4Available()) return;

  const parameters: Record<string, any> = {
    currency,
    value,
  };

  if (transactionId) {
    parameters.transaction_id = transactionId;
  }

  trackEvent('purchase', parameters);
};

/**
 * Set user properties for GA4
 */
export const setUserProperties = (properties: Record<string, any>): void => {
  if (!isGA4Available()) return;

  try {
    console.log('[Analytics] Setting user properties:', properties);
    window.gtag('config', import.meta.env.VITE_GA4_MEASUREMENT_ID, {
      custom_map: properties,
    });
  } catch (error) {
    console.error('[Analytics] Error setting user properties:', error);
  }
};

/**
 * Track page views with custom parameters
 */
export const trackPageView = (path: string, title?: string, parameters?: Record<string, any>): void => {
  if (!isGA4Available()) return;

  try {
    const pageViewData: Record<string, any> = {
      page_path: path,
      page_title: title || document.title,
      ...parameters,
    };

    console.log(`[Analytics] Tracking page view: ${path}`, pageViewData);
    window.gtag('config', import.meta.env.VITE_GA4_MEASUREMENT_ID, pageViewData);
  } catch (error) {
    console.error('[Analytics] Error tracking page view:', error);
  }
};

// Funnel tracking helper functions
export const trackFunnelEvent = {
  viewLanding: (source?: string, medium?: string) => {
    trackEvent('view_landing', {
      source,
      medium,
      page_location: window.location.href,
    });
  },

  startSignup: () => {
    trackEvent('start_signup', {
      page_location: window.location.href,
    });
  },

  completeSignup: (method = 'google') => {
    trackEvent('sign_up', {
      method,
    });
  },

  viewOnboarding: () => {
    trackEvent('view_onboarding');
  },

  completeOnboarding: (trade?: string, suburb?: string, businessName?: string) => {
    trackEvent('complete_onboarding', {
      trade,
      suburb,
      business_name: businessName,
    });
  },

  viewCampaignCreator: () => {
    trackEvent('view_campaign_creator');
  },

  generateAdCopy: (trade?: string) => {
    trackEvent('generate_ad_copy', {
      trade,
    });
  },

  createCampaign: (dailyBudgetCents?: number, radiusKm?: number) => {
    trackEvent('create_campaign', {
      daily_budget_cents: dailyBudgetCents,
      radius_km: radiusKm,
      currency: 'AUD',
    });
  },

  launchCampaign: (campaignId?: string, budget?: number) => {
    trackEvent('launch_campaign', {
      campaign_id: campaignId,
      budget,
      currency: 'AUD',
    });
  },

  launchFirstCampaign: (campaignId?: string, budget?: number) => {
    trackEvent('launch_first_campaign', {
      campaign_id: campaignId,
      budget,
      currency: 'AUD',
    });
  },

  startTrial: () => {
    trackEvent('start_trial');
  },

  beginCheckout: (plan?: string, value?: number) => {
    trackEvent('begin_checkout', {
      currency: 'AUD',
      value,
      items: [{
        item_id: plan,
        item_name: `ZuckerBot ${plan} Plan`,
        category: 'subscription',
        quantity: 1,
        price: value,
      }],
    });
  },

  convertToPaid: (plan: string, value: number, transactionId?: string) => {
    trackConversion(value, 'AUD', transactionId);
    trackEvent('convert_to_paid', {
      plan,
      currency: 'AUD',
      value,
      transaction_id: transactionId,
    });
  },
};

// Initialize GA4 enhanced ecommerce if needed
export const initializeGA4 = (): void => {
  if (!isGA4Available()) return;

  try {
    // Set up enhanced ecommerce
    window.gtag('config', import.meta.env.VITE_GA4_MEASUREMENT_ID, {
      // Enable enhanced ecommerce
      send_page_view: true,
      // Set Australia as default country
      country: 'AU',
      // Track file downloads, outbound clicks, etc.
      enhanced_conversions: true,
    });

    console.log('[Analytics] GA4 initialized successfully');
  } catch (error) {
    console.error('[Analytics] Error initializing GA4:', error);
  }
};