export const CATEGORY_DEFINITIONS = [
  { id: "sales",        label: "Πωλήσεις & Λιανική",                    emoji: "🛒" },
  { id: "hospitality",  label: "Εστίαση & Τουρισμός",                  emoji: "🍽" },
  { id: "admin",        label: "Γραφείο, Διοίκηση & Οικονομικά",       emoji: "📋" },
  { id: "construction", label: "Τεχνικά Επαγγέλματα & Κατασκευές",     emoji: "🔧" },
  { id: "tech",         label: "Πληροφορική & Digital",                emoji: "💻" },
  { id: "logistics",    label: "Logistics, Παραγωγή & Οδήγηση",        emoji: "🚛" },
  { id: "health",       label: "Υγεία & Φροντίδα",                     emoji: "🏥" },
  { id: "education",    label: "Εκπαίδευση",                           emoji: "📚" },
  { id: "marketing",    label: "Marketing & Δημιουργικά",              emoji: "📣" },
  { id: "other",        label: "Λοιπά & Υπηρεσίες",                    emoji: "📌" },
];

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_DEFINITIONS.map(category => [category.id, category.label])
);

export const CATEGORY_EMOJI = Object.fromEntries(
  CATEGORY_DEFINITIONS.map(category => [category.id, category.emoji])
);

export const ALL_CATEGORIES = CATEGORY_DEFINITIONS.map(category => category.id);
