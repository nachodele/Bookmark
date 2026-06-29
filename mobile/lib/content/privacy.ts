// Privacy policy shown at sign-up. Bump PRIVACY_POLICY_VERSION whenever the text
// materially changes so existing users can be re-prompted to re-consent.
//
// ⚠️ PLACEHOLDER LEGAL TEXT — must be reviewed/replaced by legal counsel before launch.
// "Data commercialization" consent in particular has GDPR/CCPA implications: consent must
// be specific, informed, freely given, and separately revocable. Do not ship as-is.

export const PRIVACY_POLICY_VERSION = 1;

export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  version: PRIVACY_POLICY_VERSION,
  // Short summary rendered next to the consent checkbox.
  consentSummary:
    'I have read and agree to the Privacy Policy, including the processing and commercialization of my anonymized data to improve and operate the service.',
  body: `Last updated: 2026-06-26 · Version ${PRIVACY_POLICY_VERSION}

PLACEHOLDER — pending legal review.

1. What we collect
We store the links you save, the categories ("nooks") they are organized into, AI-generated titles, descriptions, keywords, and basic usage signals (e.g. when an item is opened or favorited). We also store your account email.

2. How we use it
- To operate the app: organizing, classifying, searching, and displaying your saved resources.
- To improve our AI: aggregated and anonymized data derived from saved resources may be used to train and improve classification and recommendation models.

3. Data commercialization
By creating an account you consent to the use of anonymized, aggregated data derived from your activity for commercial purposes, including training models that may be offered as part of paid products. We do not sell content that personally identifies you.

4. Your choices
You may request deletion of your account and associated data at any time by contacting support. Where required by law, you may withdraw consent; some features may stop working without it.

5. Contact
supportnook@gmail.com

This text is a placeholder and does not yet constitute a binding privacy policy.`,
};
