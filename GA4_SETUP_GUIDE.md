# Google Analytics 4 Setup Guide

## 🎯 What's Been Implemented

Full GA4 tracking has been added to zuckerbot.ai to track the complete user funnel from Facebook ads → signup → trial → paid conversion.

### ✅ Tracking Events Added

**Key Funnel Events:**
- `view_landing` - Landing page views (with UTM tracking)
- `start_signup` - "Get Started" button clicks
- `sign_up` - Completed signups (Google OAuth + email)
- `view_onboarding` - Onboarding page views
- `complete_onboarding` - Business setup completion
- `view_campaign_creator` - Campaign creator page views
- `generate_ad_copy` - AI ad copy generation
- `create_campaign` - Campaign creation
- `launch_campaign` - Campaign launches
- `launch_first_campaign` - First campaign launches (special tracking)
- `begin_checkout` - Checkout initiation
- `purchase` - Successful conversions (ready for implementation)

**Enhanced Page Views:**
- All major pages have custom parameters
- UTM parameter tracking from Facebook ads
- User progression state tracking

## 🚀 Next Steps for Davis

### 1. Create GA4 Property

1. Go to [analytics.google.com](https://analytics.google.com)
2. Click "Create" → "Property"
3. Set up property for "zuckerbot.ai":
   - Property name: "ZuckerBot"
   - Country: Australia
   - Currency: Australian Dollar (AUD)
   - Industry: "Advertising & Marketing"

### 2. Get Measurement ID

1. After creating the property, go to Admin → Data Streams
2. Click "Add stream" → "Web"
3. Enter "https://zuckerbot.ai" as the website URL
4. Copy the **Measurement ID** (format: G-XXXXXXXXXX)

### 3. Configure Environment Variable

Add the measurement ID to Vercel environment variables:

```bash
# In Vercel dashboard or via CLI:
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Important:** The app checks for this exact variable name and won't track if it's missing or set to the placeholder value.

### 4. Set Up Conversion Events

In GA4, mark these events as conversions:

**Primary Conversions:**
- `sign_up` - New user registrations
- `complete_onboarding` - Completed business setups
- `launch_campaign` - Campaign launches
- `purchase` - Paid conversions

**Secondary Conversions:**
- `launch_first_campaign` - First-time campaign launches
- `begin_checkout` - Checkout starts

### 5. Create Custom Audiences

Set up audiences for retargeting:

1. **Signed Up but Not Onboarded**: `sign_up` without `complete_onboarding`
2. **Onboarded but No Campaign**: `complete_onboarding` without `launch_campaign`
3. **Created Campaign but Not Paying**: `launch_campaign` without `purchase`

### 6. Configure Enhanced Conversions

1. In GA4 → Admin → Conversions
2. For `purchase` events, enable Enhanced Conversions
3. This will improve conversion measurement accuracy

## 🧪 Testing

### Development Mode
- GA4 tracking is **disabled** in development mode (`npm run dev`)
- Console logs show tracking attempts but no data is sent

### Testing Checklist
1. Deploy to staging/production
2. Complete the full user flow:
   - Land on homepage (check UTM parameters work)
   - Sign up with Google
   - Complete onboarding
   - Create and launch a campaign
   - Visit billing/pricing pages
3. Check GA4 real-time reports to verify events are firing

### Debug Console
All tracking events log to the browser console with the format:
```
[Analytics] Tracking event: sign_up {method: 'google'}
```

## 📊 Expected Funnel Analysis

Once set up, you'll be able to track:

1. **Traffic Sources**: Which Facebook ad campaigns drive the most traffic
2. **Conversion Rates**: 
   - Landing → Signup (%)
   - Signup → Onboarding (%)
   - Onboarding → First Campaign (%)
   - Campaign → Paid (%)
3. **User Journey**: Time between each funnel step
4. **Drop-off Points**: Where users abandon the flow

## 🔧 Technical Details

- **Framework**: React + Vite with TypeScript
- **Implementation**: Custom analytics utility (`src/utils/analytics.ts`)
- **Environment**: Uses `VITE_GA4_MEASUREMENT_ID` for client-side access
- **Error Handling**: Gracefully handles GA4 loading failures
- **Privacy**: Respects user's tracking preferences and development mode

## 📝 Future Enhancements

Ready to implement when needed:
- Enhanced ecommerce tracking for subscription values
- Custom parameters for ad creative testing
- Cross-domain tracking if expanding to multiple domains
- Server-side event tracking via Measurement Protocol

---

**Questions or issues?** The implementation is production-ready and follows GA4 best practices. All events include meaningful parameters for detailed analysis.