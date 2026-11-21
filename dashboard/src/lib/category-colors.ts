export const CATEGORY_COLOR_VARS = [
  "var(--blue)",
  "var(--accent)",
  "var(--purple)",
  "var(--cyan)",
  "var(--pink)",
  "var(--green)",
  "var(--cat7)",
] as const;

export type CategoryColorVar = (typeof CATEGORY_COLOR_VARS)[number];

interface SemanticColorRule {
  color: CategoryColorVar;
  keywords: readonly string[];
}

const SEMANTIC_CATEGORY_RULES: readonly SemanticColorRule[] = [
  {
    color: "var(--blue)",
    keywords: [
      "nha o",
      "tien nha",
      "housing",
      "rent",
      "home",
      "apartment",
      "mortgage",
    ],
  },
  {
    color: "var(--accent)",
    keywords: [
      "an uong",
      "food",
      "dining",
      "coffee",
      "cafe",
      "ca phe",
      "groceries",
      "grocery",
      "sieu thi",
      "drink",
      "meal",
      "restaurant",
    ],
  },
  {
    color: "var(--purple)",
    keywords: [
      "mua sam",
      "shopping",
      "shop",
      "retail",
      "clothes",
      "clothing",
      "fashion",
    ],
  },
  {
    color: "var(--cyan)",
    keywords: [
      "di chuyen",
      "transport",
      "transportation",
      "travel",
      "commute",
      "taxi",
      "grab",
      "fuel",
      "xang",
      "parking",
      "flight",
    ],
  },
  {
    color: "var(--pink)",
    keywords: [
      "giai tri",
      "entertainment",
      "movie",
      "cinema",
      "music",
      "game",
      "gaming",
      "leisure",
      "hobby",
    ],
  },
  {
    color: "var(--green)",
    keywords: [
      "dich vu",
      "dang ky",
      "subscriptions",
      "subscription",
      "bills",
      "bill",
      "hoa don",
      "tien ich",
      "utilities",
      "utility",
      "internet",
      "dien",
      "nuoc",
      "salary",
      "luong",
      "income",
    ],
  },
  {
    color: "var(--cat7)",
    keywords: [
      "suc khoe",
      "health",
      "healthcare",
      "medical",
      "medicine",
      "pharmacy",
      "thuoc",
      "doctor",
      "hospital",
      "fitness",
      "gym",
    ],
  },
];

function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasKeyword(paddedText: string, keyword: string): boolean {
  return paddedText.includes(` ${keyword} `);
}

function hashCategoryId(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getCategoryColor(
  categoryId: string | null | undefined,
  categoryName?: string,
): string {
  if (categoryId === null || categoryId === undefined) {
    return "var(--muted)";
  }

  const trimmedId = categoryId.trim();
  if (!trimmedId) {
    return "var(--muted)";
  }

  const combined = normalizeForMatch(
    categoryName ? `${trimmedId} ${categoryName}` : trimmedId,
  );
  if (combined) {
    const padded = ` ${combined} `;
    for (const rule of SEMANTIC_CATEGORY_RULES) {
      for (const keyword of rule.keywords) {
        if (hasKeyword(padded, keyword)) {
          return rule.color;
        }
      }
    }
  }

  const index = hashCategoryId(trimmedId.toLowerCase()) % CATEGORY_COLOR_VARS.length;
  return CATEGORY_COLOR_VARS[index]!;
}
