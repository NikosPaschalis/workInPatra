export { ALL_CATEGORIES, CATEGORY_LABELS } from "../categories.js";

const CATEGORIES = [
  {
    id: "sales",
    label: "Πωλήσεις & Λιανική",
    keywords: [
      "πωλητ", "πωλησ", "sales", "b2b", "b2c", "αντιπροσωπ", "account manager",
      "εμπορικ", "προωθησ", "merchandis", "key account", "τηλεπωλητ",
      "telesales", "ταμι", "cashier", "λιανικ", "retail", "supermarket",
      "σουπερ μαρκετ", "υπαλληλος καταστημα", "εξυπηρετηση πελατ",
      "customer service", "customer support", "shop assistant",
      "ιατρικος επισκεπτης",
    ],
  },
  {
    id: "hospitality",
    label: "Εστίαση & Τουρισμός",
    keywords: [
      "σερβιτορ", "bartender", "barista", "μαγειρ", "chef", "κουζιν",
      "εστιατορ", "εστιαση", "καφε", "ξενοδοχ", "hotel", "τουρισμ",
      "receptionist", "ρεσεψιον", "front desk", "housekeeping", "καμαριερ",
      "λαντζ", "κετερινγκ", "catering", "ζαχαροπλαστ", "αρτοποι", "φουρν",
      "food and beverage",
    ],
  },
  {
    id: "admin",
    label: "Γραφείο, Διοίκηση & Οικονομικά",
    keywords: [
      "λογιστ", "accountant", "γραμματ", "secretary", "υπαλληλος γραφ",
      "διοικητ", "human resources", "payroll", "οικονομολ", "χρηματοοικ",
      "office administrator", "back office", "data entry", "νομικ", "lawyer",
    ],
  },
  {
    id: "construction",
    label: "Τεχνικά Επαγγέλματα & Κατασκευές",
    keywords: [
      "μηχανολογ", "ηλεκτρολογ", "μηχανικ", "τεχνιτ", "τεχνικ", "συντηρητ",
      "εγκαταστ", "κατασκευ", "οικοδομ", "αρχιτεκτ", "πολιτικ μηχ",
      "τοπογραφ", "εργολαβ", "υδραυλ", "ψυκτικ", "ανελκυστ", "κολλητ",
      "οπτικων ινων", "fiber", "service technician",
    ],
  },
  {
    id: "tech",
    label: "Πληροφορική & Digital",
    keywords: [
      "developer", "software engineer", "data engineer", "frontend", "backend",
      "fullstack", "devops", "python", "java", "javascript", "react", "node",
      "php", "sql", "cloud", "πληροφορικ", "προγραμματιστ", "helpdesk",
      "machine learning", "web developer", "mobile developer", "android", "ios",
      "network administrator", "sysadmin", "linux", "cybersecurity",
    ],
  },
  {
    id: "logistics",
    label: "Logistics, Παραγωγή & Οδήγηση",
    keywords: [
      "οδηγ", "driver", "διανομ", "logistics", "αποθηκ", "forklift",
      "ανυψωτικ", "courier", "delivery", "μεταφορ", "warehouse", "τελωνει",
      "ναυτιλ", "supply chain", "παραγωγ", "picker", "συσκευασ",
      "χειριστ μηχαν",
    ],
  },
  {
    id: "health",
    label: "Υγεία & Φροντίδα",
    keywords: [
      "νοσηλευτ", "φαρμακ", "ιατρ", "doctor", "nurse", "αισθητικ", "οδοντ",
      "φυσιοθεραπ", "ψυχολογ", "κοινωνικ λειτουργ", "νοσοκομ", "κλινικ",
      "παιδιατρ", "θεραπευτ", "διαιτολογ", "γηροκομ", "φροντιδα ηλικιω",
    ],
  },
  {
    id: "education",
    label: "Εκπαίδευση",
    keywords: [
      "εκπαιδευτ", "καθηγητ", "δασκαλ", "teacher", "tutor", "φροντιστηρ",
      "παιδαγωγ", "νηπιαγωγ", "παιδικ σταθμ", "φυλαξη παιδ", "baby sitter",
      "babysitter", "νταντα", "trainer", "εκπαιδευση",
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Δημιουργικά",
    keywords: [
      "marketing", "seo", "sem", "social media", "content", "copywriter",
      "copywriting", "brand", "διαφημισ", "μαρκετινγκ", "επικοινωνια",
      "δημοσιες σχεσεις", "growth", "e-commerce", "ecommerce", "campaign",
      "influencer", "creative", "γραφιστ", "graphic design", "adobe",
      "photoshop", "illustrator", "motion", "βιντεογραφ", "φωτογραφ",
    ],
  },
];

const OTHER_TITLE_KEYWORDS = [
  "καθαριστ", "καθαρισμ", "security guard", "φυλακας", "φυλαξη", "ασφαλειας",
];

const KARIERA_CATEGORY_MAP = {
  RETAIL: "sales",
  SALES_BUSINESS_DEVELOPMENT_ACCOUNT_MANAGEMENT: "sales",
  CALL_CENTER_CUSTOMER_SUPPORT: "sales",
  REAL_ESTATE: "sales",
  TOURISM: "hospitality",
  FOOD_CAFE: "hospitality",
  ADMINISTRATIVE_SECRETARIAL: "admin",
  ACCOUNTING_AUDITING: "admin",
  GENERAL_MANAGEMENT: "admin",
  HUMAN_RESOURCES: "admin",
  PROCUREMENT_SUPPLY_CHAIN: "admin",
  LEGAL: "admin",
  FINANCE: "admin",
  BUSINESS_OPERATIONS: "admin",
  BUSINESS_CONSULTANT: "admin",
  ENGINEERING: "construction",
  TECHNICIANS_SERVICE: "construction",
  CONSTRUCTION_ENGINEERS_ARCHITECTS: "construction",
  IT: "tech",
  ANALYST_BI: "tech",
  RESEARCH_DEVELOPMENT: "tech",
  LOGISTICS_WAREHOUSE: "logistics",
  TRANSPORT_DRIVING: "logistics",
  PRODUCTION: "logistics",
  WORKERS: "logistics",
  MEDICINE_HEALTHCARE: "health",
  BEAUTY_FITNESS: "health",
  EDUCATION: "education",
  MARKETING_ADVERTISING: "marketing",
  PUBLIC_RELATIONS: "marketing",
  DESIGN_GRAPHICS_CREATIVE: "marketing",
  MEDIA: "marketing",
  SECURITY: "other",
  AGRICULTURE: "other",
  SOCIAL_VOLUNTEER_SERVICES: "other",
};

const SOURCE_CATEGORY_RULES = {
  jobfind: [
    ["πληροφορικ", "tech"],
    ["digital marketing", "marketing"],
    ["πωλησεις λιανικης", "sales"],
    ["τηλεφωνικες υπηρεσιες", "sales"],
    ["ασφαλιστικα", "sales"],
    ["εστιαση", "hospitality"],
    ["logistics", "logistics"],
    ["παραγωγη", "logistics"],
    ["υγεια", "health"],
    ["τεχνικοι", "construction"],
    ["μηχανικοι", "construction"],
    ["προσωπικο ασφαλειας", "other"],
  ],
  xe: [
    ["marketing", "marketing"],
    ["διαφημισ", "marketing"],
    ["πωλητ", "sales"],
    ["ταμι", "sales"],
    ["λιανικ", "sales"],
    ["τηλεφωνικ", "sales"],
    ["σερβιτορ", "hospitality"],
    ["εστιασ", "hospitality"],
    ["μαγειρ", "hospitality"],
    ["τουρισ", "hospitality"],
    ["γραμματειακ", "admin"],
    ["λογιστ", "admin"],
    ["αρχιτεκτ", "construction"],
    ["ηλεκτρολογ", "construction"],
    ["υδραυλικ", "construction"],
    ["εγκαταστ", "construction"],
    ["τεχνικ", "construction"],
    ["μηχανικ", "construction"],
    ["logistics", "logistics"],
    ["αποθηκ", "logistics"],
    ["εργατ", "logistics"],
    ["φαρμακο", "health"],
    ["γηροκομ", "health"],
    ["αισθητικ", "health"],
    ["baby sitter", "education"],
    ["νταντα", "education"],
    ["καθαρισ", "other"],
    ["ασφαλει", "other"],
    ["διαφορες υπηρεσιες", "other"],
  ],
};

export function normalizeCategoryText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapSourceCategory(source = "", sourceCategory = "") {
  if (!sourceCategory) return null;

  if (source === "kariera") {
    const key = String(sourceCategory).trim().toUpperCase();
    return Object.hasOwn(KARIERA_CATEGORY_MAP, key)
      ? KARIERA_CATEGORY_MAP[key]
      : null;
  }

  const normalized = normalizeCategoryText(sourceCategory);
  const rules = SOURCE_CATEGORY_RULES[source] || [];
  const match = rules.find(([fragment]) =>
    normalized.includes(normalizeCategoryText(fragment))
  );
  return match?.[1] || null;
}

function matchTextCategories(value) {
  const haystack = normalizeCategoryText(value);
  const matches = [];

  for (const category of CATEGORIES) {
    if (category.keywords.some(keyword =>
      haystack.includes(normalizeCategoryText(keyword))
    )) {
      matches.push(category.id);
    }
  }

  if (OTHER_TITLE_KEYWORDS.some(keyword =>
    haystack.includes(normalizeCategoryText(keyword))
  )) {
    matches.push("other");
  }

  return matches;
}

// Fallback for sources without a useful category, or for generic source
// categories such as Kariera's OTHER.
export function categorize(title = "", tags = []) {
  return matchTextCategories(`${title} ${tags.join(" ")}`)[0] ?? "other";
}

export function categorizeJob(job = {}) {
  const mapped = mapSourceCategory(job.source, job.sourceCategory);
  const titleCategories = matchTextCategories(job.title || "");

  // When a title legitimately matches multiple groups (for example a cashier
  // in a restaurant), use the source category as the tie-breaker.
  if (mapped && titleCategories.includes(mapped)) return mapped;

  // A single precise title match corrects occasional source mistakes, such as
  // a seller published under Marketing or a cleaner published under Workers.
  if (titleCategories.length === 1) return titleCategories[0];

  // Without a useful source value, retain the deterministic keyword order.
  if (titleCategories.length > 1) return titleCategories[0];

  return mapped ?? categorize(job.title, job.tags || []);
}
