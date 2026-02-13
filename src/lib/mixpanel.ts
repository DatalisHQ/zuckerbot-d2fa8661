// Mixpanel Analytics - ZuckerBot
// Handles Mixpanel initialization, user identification, and event tracking
import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = "d9f17a1063ad9493b265cce5551f04c5";

/**
 * Initialize Mixpanel SDK with autocapture and session replay
 */
export const initMixpanel = (): void => {
  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: import.meta.env.DEV,
      track_pageview: true,
      persistence: "localStorage",
      autocapture: true,
      record_sessions_percent: 100,
    });
    console.log("[Mixpanel] Initialized successfully");
  } catch (error) {
    console.error("[Mixpanel] Error initializing:", error);
  }
};

/**
 * Identify a user and set their profile properties
 */
export const identifyUser = (
  userId: string,
  properties?: {
    email?: string;
    name?: string;
    plan?: string;
    signup_method?: string;
    created_at?: string;
  }
): void => {
  try {
    mixpanel.identify(userId);
    if (properties) {
      const peopleProps: Record<string, any> = {};
      if (properties.email) peopleProps["$email"] = properties.email;
      if (properties.name) peopleProps["$name"] = properties.name;
      if (properties.plan) peopleProps["plan"] = properties.plan;
      if (properties.signup_method) peopleProps["signup_method"] = properties.signup_method;
      if (properties.created_at) peopleProps["$created"] = properties.created_at;
      mixpanel.people.set(peopleProps);
    }
    console.log("[Mixpanel] User identified:", userId);
  } catch (error) {
    console.error("[Mixpanel] Error identifying user:", error);
  }
};

/**
 * Reset Mixpanel on logout
 */
export const resetMixpanel = (): void => {
  try {
    mixpanel.reset();
    console.log("[Mixpanel] Reset (user logged out)");
  } catch (error) {
    console.error("[Mixpanel] Error resetting:", error);
  }
};

// ── Event Tracking ──────────────────────────────────────────────────────

/**
 * Track a generic event
 */
export const mpTrack = (eventName: string, properties?: Record<string, any>): void => {
  try {
    mixpanel.track(eventName, properties);
  } catch (error) {
    console.error("[Mixpanel] Error tracking event:", error);
  }
};

/**
 * Sign Up event
 */
export const mpSignUp = (properties: {
  user_id: string;
  email: string;
  signup_method: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}): void => {
  mpTrack("Sign Up", properties);
};

/**
 * Sign In event
 */
export const mpSignIn = (properties: {
  user_id: string;
  login_method: string;
  success: boolean;
}): void => {
  mpTrack("Sign In", properties);
};

/**
 * Page View event (supplementary to autocapture)
 */
export const mpPageView = (properties: {
  page_url: string;
  page_title: string;
  user_id?: string;
}): void => {
  mpTrack("Page View", properties);
};

/**
 * Error event
 */
export const mpError = (properties: {
  error_type: string;
  error_message: string;
  error_code?: string;
  page_url?: string;
  user_id?: string;
}): void => {
  mpTrack("Error", {
    ...properties,
    page_url: properties.page_url || window.location.href,
  });
};

/**
 * Purchase event (Stripe subscription started)
 */
export const mpPurchase = (properties: {
  user_id: string;
  transaction_id: string;
  revenue: number;
  currency: string;
}): void => {
  mpTrack("Purchase", properties);
  // Also track revenue on the user profile
  try {
    mixpanel.people.track_charge(properties.revenue, {
      $currency: properties.currency,
      transaction_id: properties.transaction_id,
    });
  } catch (error) {
    console.error("[Mixpanel] Error tracking charge:", error);
  }
};

/**
 * Conversion event (key value moments in the product)
 */
export const mpConversion = (properties: {
  conversion_type: string;
  conversion_value?: number;
}): void => {
  mpTrack("Conversion", {
    "Conversion Type": properties.conversion_type,
    "Conversion Value": properties.conversion_value,
  });
};

// ── ZuckerBot-Specific Funnel Events ────────────────────────────────────

export const mpFunnel = {
  /** User starts onboarding wizard */
  startOnboarding: (userId?: string) => {
    mpTrack("Start Onboarding", { user_id: userId });
  },

  /** User completes onboarding */
  completeOnboarding: (properties: {
    user_id?: string;
    business_type?: string;
    location?: string;
    business_name?: string;
  }) => {
    mpTrack("Complete Onboarding", properties);
    mpConversion({ conversion_type: "onboarding_complete" });
  },

  /** User opens campaign creator */
  viewCampaignCreator: (userId?: string) => {
    mpTrack("View Campaign Creator", { user_id: userId });
  },

  /** User generates ad copy */
  generateAdCopy: (properties: {
    user_id?: string;
    business_type?: string;
  }) => {
    mpTrack("Generate Ad Copy", properties);
  },

  /** User creates a campaign */
  createCampaign: (properties: {
    user_id?: string;
    daily_budget?: number;
    radius_km?: number;
  }) => {
    mpTrack("Create Campaign", properties);
  },

  /** User launches a campaign on Meta */
  launchCampaign: (properties: {
    user_id?: string;
    campaign_id?: string;
    budget?: number;
  }) => {
    mpTrack("Launch Campaign", properties);
    mpConversion({ conversion_type: "campaign_launch", conversion_value: properties.budget });
  },

  /** User connects Facebook account */
  connectFacebook: (userId?: string) => {
    mpTrack("Connect Facebook", { user_id: userId });
  },

  /** User starts checkout / trial */
  startCheckout: (properties: {
    user_id?: string;
    plan?: string;
    value?: number;
  }) => {
    mpTrack("Start Checkout", properties);
  },

  /** User marks a lead status */
  updateLeadStatus: (properties: {
    user_id?: string;
    new_status?: string;
    lead_id?: string;
  }) => {
    mpTrack("Update Lead Status", properties);
  },
};
