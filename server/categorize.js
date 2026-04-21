const CATEGORIES = [
  {
    id: "tech",
    label: "Πληροφορική",
    keywords: [
      "developer","engineer","software","frontend","backend","fullstack","devops",
      "python","java","javascript","react","node","php","sql","data","cloud",
      "it ","πληροφορική","προγραμματιστ","υποστήριξη συστημάτων","helpdesk",
      "analyst","machine learning","ai ","τεχνολογί","web","mobile","android","ios",
      "network","sysadmin","linux","cybersecurity","ασφάλεια πληροφοριών",
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Επικοινωνία",
    keywords: [
      "marketing","digital marketing","seo","sem","social media","content",
      "copywriter","copywriting","brand","διαφήμιση","μάρκετινγκ","επικοινωνία",
      "δημόσιες σχέσεις","pr ","growth","e-commerce","ecommerce","campaign",
      "influencer","creative","γραφίστ","graphic design","adobe","photoshop",
      "illustrator","motion","βιντεογράφ","φωτογράφ",
    ],
  },
  {
    id: "sales",
    label: "Πωλήσεις",
    keywords: [
      "πωλητ","sales","b2b","b2c","αντιπρόσωπ","account manager","εμπορικ",
      "προώθηση","merchandis","key account","τηλεπωλητ","telesales",
    ],
  },
  {
    id: "hospitality",
    label: "Εστίαση & Τουρισμός",
    keywords: [
      "σερβιτόρ","bartender","barista","μάγειρ","chef","κουζίν","εστιατόρ",
      "εστίαση","καφέ","καφετέρι","ξενοδοχ","hotel","τουρισμ","receptionist",
      "ρεσεψιόν","front desk","housekeeping","καμαριέρ","λάντζ",
      "καθαριστ","καθαρισμ","κέτερινγκ","catering","ζαχαροπλαστ","αρτοποι",
      "φούρν","delivery rider","jackaroo",
    ],
  },
  {
    id: "health",
    label: "Υγεία & Φαρμακείο",
    keywords: [
      "νοσηλευτ","φαρμακ","ιατρ","doctor","nurse","βοηθ νοσηλ","αισθητικ",
      "οδοντ","φυσιοθεραπ","ψυχολόγ","κοινωνικ λειτουργ","νοσοκομ",
      "κλινικ","παιδίατρ","χειρούργ","θεραπευτ","βοηθ φαρμ","διαιτολόγ",
    ],
  },
  {
    id: "logistics",
    label: "Μεταφορές & Αποθήκη",
    keywords: [
      "οδηγ","driver","διανομ","logistics","αποθήκ","forklift","ανυψωτικ",
      "courier","delivery","μεταφορ","warehouse","τελωνεί","ναυτιλ","supply chain",
    ],
  },
  {
    id: "admin",
    label: "Διοίκηση & Λογιστική",
    keywords: [
      "λογιστ","accountant","γραμματ","secretary","υπάλληλος γραφ","διοικητ",
      "hr ","human resources","προσωπικ","payroll","οικονομολόγ","χρηματοοικ",
      "διευθυντ","manager","διαχειριστ","υπεύθυν","office","τηλεφωνητ",
    ],
  },
  {
    id: "retail",
    label: "Λιανική & Εξυπηρέτηση",
    keywords: [
      "ταμί","cashier","λιανικ","retail","supermarket","σούπερ μάρκετ",
      "κατάστημ","εξυπηρέτηση πελατ","customer service","customer support",
      "βοηθ καταστ","shop assistant","πωλητής καταστ",
    ],
  },
  {
    id: "construction",
    label: "Τεχνικά & Κατασκευές",
    keywords: [
      "μηχανολόγ","ηλεκτρολόγ","μηχανικ","τεχνιτ","συντηρητ","εγκαταστ",
      "κατασκευ","οικοδομ","αρχιτέκτ","πολιτικ μηχ","τοπογράφ","εργολάβ",
      "υδραυλ","ψυκτικ","ανελκυστ","lift","παραγωγ","χειριστ μηχαν",
    ],
  },
  {
    id: "education",
    label: "Εκπαίδευση",
    keywords: [
      "εκπαιδευτ","καθηγητ","δάσκαλ","teacher","tutor","φροντιστ","παιδαγωγ",
      "νηπιαγωγ","παιδικ σταθμ","φύλαξη παιδ","trainer","coach","εκπαίδευση",
    ],
  },
];

export function categorize(title = "", tags = []) {
  const haystack = (title + " " + tags.join(" ")).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => haystack.includes(kw))) return cat.id;
  }
  return "other";
}

export const CATEGORY_LABELS = Object.fromEntries(
  [...CATEGORIES.map(c => [c.id, c.label]), ["other", "Άλλα"]]
);

export const ALL_CATEGORIES = [...CATEGORIES.map(c => c.id), "other"];
