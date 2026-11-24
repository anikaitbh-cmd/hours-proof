// Public web config. These values identify the Firebase project; they are not secrets.
// Access is protected by App Check (reCAPTCHA Enterprise), not by hiding this file.
export const firebaseConfig = {
  apiKey: "AIzaSyC4p_Cer38Dfb3lkRrAU4lcfbmPVw5yaRk",
  authDomain: "hours-proof.firebaseapp.com",
  projectId: "hours-proof",
  storageBucket: "hours-proof.firebasestorage.app",
  messagingSenderId: "814146661947",
  appId: "1:814146661947:web:41deb71e5f64281968b61e",
};

export const RECAPTCHA_ENTERPRISE_SITE_KEY = "6Lc6ci8uAAAAAJskSl_vxTzSRqYMlOsNNVHhoJpk";

// Default cloud model. Remote Config key `cloud_model` overrides it without a redeploy.
export const DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite";

// The rule check reads only these public pages (Gemini URL context). Nothing else.
export const RULE_SOURCES = [
  {
    title: "CMS fact sheet: Medicaid community engagement requirement (interim final rule)",
    url: "https://cms.gov/newsroom/fact-sheets/medicaid-community-engagement-requirement-certain-individuals-interim-final-rule-comment-period-cms",
  },
  {
    title: "Missouri DSS: Community engagement requirements, FAQ",
    url: "https://dss.mo.gov/community-engagement-requirements-frequently-asked-questions",
  },
  {
    title: "Missouri DSS: Community engagement communications toolkit",
    url: "https://dss.mo.gov/citizen-enhancement-community-engagement-communications-toolkit",
  },
];

// Federal rule constants. The app shows where each comes from.
export const RULE = {
  hoursPerMonth: 80,
  federalMinWage: 7.25,
  incomeRoute: 80 * 7.25, // $580
  responseWindowDays: 35, // Missouri noncompliance notice
};
