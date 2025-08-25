// Meta Pixel + Conversions API tracking with Stape integration
// Provides client-side pixel tracking and server-side CAPI with deduplication

import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

// Environment configuration - Dynamic pixel ID from environment
const META_PIXEL_ID = '1103916034408939'; // This should be replaced with process.env value when available
const IS_PRODUCTION = window.location.hostname !== 'localhost';

// User data hashing utility
async function hashUserData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Client-side pixel tracking
class MetaPixel {
  private pixelId: string;
  private initialized = false;
  private consentGranted = false;

  constructor(pixelId: string) {
    this.pixelId = pixelId;
  }

  // Initialize Meta Pixel
  init(consentGranted = false) {
    if (this.initialized) return;
    
    this.consentGranted = consentGranted;
    
    console.log('🎯 Initializing Meta Pixel:', this.pixelId.slice(0, 4) + '****');
    
    // Load Facebook Pixel script
    (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function(...args: any[]) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    // Initialize pixel
    (window as any).fbq('init', this.pixelId, {
      em: 'hashed_email_placeholder', // Will be updated when user provides consent
    });

    // Track initial page view
    this.track('PageView');
    
    this.initialized = true;
  }

  // Grant consent and enable advanced matching
  grantConsent(userEmail?: string) {
    if (!this.initialized) return;
    
    this.consentGranted = true;
    console.log('✅ Meta Pixel consent granted - enabling advanced matching');
    
    // Update pixel with user data if available
    if (userEmail) {
      (window as any).fbq('init', this.pixelId, {
        em: userEmail,
      });
    }
  }

  // Track events with deduplication
  track(eventName: string, parameters: Record<string, any> = {}, eventId?: string) {
    if (!this.initialized) {
      console.warn('⚠️ Meta Pixel not initialized');
      return null;
    }

    const dedupeId = eventId || uuidv4();
    const trackingParams = {
      ...parameters,
      eventID: dedupeId,
    };

    console.log(`🎯 Pixel: ${eventName}`, { eventId: dedupeId, params: trackingParams });
    
    (window as any).fbq('track', eventName, trackingParams);
    
    return dedupeId;
  }

  // Track custom conversions
  trackCustom(eventName: string, parameters: Record<string, any> = {}, eventId?: string) {
    if (!this.initialized) {
      console.warn('⚠️ Meta Pixel not initialized');
      return null;
    }

    const dedupeId = eventId || uuidv4();
    const trackingParams = {
      ...parameters,
      eventID: dedupeId,
    };

    console.log(`🎯 Pixel Custom: ${eventName}`, { eventId: dedupeId, params: trackingParams });
    
    (window as any).fbq('trackCustom', eventName, trackingParams);
    
    return dedupeId;
  }
}

// Server-side CAPI tracking via Stape
interface CAPIEventData {
  event_name: string;
  event_id: string;
  user_data?: {
    email?: string;
    phone?: string;
    external_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data?: Record<string, any>;
  source_url: string;
  test_code?: string;
}

class ConversionsAPI {
  private async sendToStape(eventData: CAPIEventData) {
    try {
      const { data, error } = await supabase.functions.invoke('track-meta-conversion', {
        body: eventData
      });

      if (error) {
        console.error('❌ CAPI Error:', error);
        return false;
      }

      console.log('✅ CAPI Event sent via Stape:', eventData.event_name);
      return true;
    } catch (error) {
      console.error('❌ CAPI Transport Error:', error);
      return false;
    }
  }

  async track(eventData: Omit<CAPIEventData, 'source_url'>) {
    const fullEventData: CAPIEventData = {
      ...eventData,
      source_url: window.location.href,
      // Include client context
      user_data: {
        ...eventData.user_data,
        client_ip_address: eventData.user_data?.client_ip_address || undefined,
        client_user_agent: navigator.userAgent,
      }
    };

    return this.sendToStape(fullEventData);
  }
}

// Main tracking class with deduplication
class MetaTracking {
  private pixel: MetaPixel;
  private capi: ConversionsAPI;
  private currentUser: any = null;

  constructor() {
    this.pixel = new MetaPixel(META_PIXEL_ID);
    this.capi = new ConversionsAPI();
    this.initUserContext();
  }

  private async initUserContext() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      this.currentUser = user;
    } catch (error) {
      console.log('No authenticated user for tracking');
    }
  }

  // Initialize tracking (call once on app load)
  init(consentGranted = false) {
    this.pixel.init(consentGranted);
  }

  // Grant consent for advanced tracking
  grantConsent() {
    this.pixel.grantConsent(this.currentUser?.email);
  }

  // Track events with automatic deduplication
  async trackEvent(
    eventName: string, 
    customData: Record<string, any> = {},
    userEmail?: string
  ) {
    const eventId = uuidv4();
    
    // Track with pixel (client-side)
    this.pixel.track(eventName, customData, eventId);
    
    // Track with CAPI (server-side) with same event ID for deduplication
    if (this.currentUser || userEmail) {
      const email = userEmail || this.currentUser?.email;
      
      await this.capi.track({
        event_name: eventName,
        event_id: eventId,
        user_data: email ? {
          email: await hashUserData(email),
          external_id: this.currentUser?.id ? await hashUserData(this.currentUser.id) : undefined,
        } : undefined,
        custom_data: customData,
        test_code: !IS_PRODUCTION ? 'TEST' : undefined,
      });
    }

    return eventId;
  }

  // Convenience methods for common events
  async trackPageView() {
    return this.trackEvent('PageView');
  }

  async trackLead(email?: string) {
    return this.trackEvent('Lead', {}, email);
  }

  async trackCompleteRegistration(email?: string) {
    return this.trackEvent('CompleteRegistration', {}, email);
  }

  async trackPurchase(value: number, currency = 'USD') {
    return this.trackEvent('Purchase', { value, currency });
  }

  async trackInitiateCheckout() {
    return this.trackEvent('InitiateCheckout');
  }

  async trackCampaignLaunch(campaignName: string) {
    return this.trackEvent('CampaignLaunch', { campaign_name: campaignName });
  }

  // Custom events
  async trackCustom(eventName: string, customData: Record<string, any> = {}) {
    const eventId = uuidv4();
    
    // Track custom event with pixel
    this.pixel.trackCustom(eventName, customData, eventId);
    
    // Track with CAPI
    if (this.currentUser) {
      await this.capi.track({
        event_name: eventName,
        event_id: eventId,
        user_data: this.currentUser.email ? {
          email: await hashUserData(this.currentUser.email),
          external_id: await hashUserData(this.currentUser.id),
        } : undefined,
        custom_data: customData,
      });
    }

    return eventId;
  }
}

// Export singleton instance
export const metaTracking = new MetaTracking();

// Re-export for convenience
export { MetaTracking, MetaPixel, ConversionsAPI };