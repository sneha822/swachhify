export type Role = "customer" | "partner" | "recycler" | "admin";
export type Lang = "en" | "hi";

export interface User {
  id: number;
  public_code: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  language: Lang;
  notification_prefs: NotificationPrefs;
  created_at: string;
}

export interface NotificationPrefs {
  pickup_updates: boolean;
  rewards: boolean;
  learning_reminders: boolean;
  daily_tip: boolean;
  campaigns: boolean;
  channels: { in_app: boolean; email: boolean; sms: boolean; whatsapp: boolean };
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface Category {
  slug: string;
  name: string;
  name_hi: string;
  emoji: string;
  color: string;
  short: string;
  short_hi: string;
  collectable: boolean;
  donatable: boolean;
  points_per_kg: number;
  guidance: Record<Lang, { do: string[]; dont: string[]; why: string }>;
}

export interface WasteItem {
  slug: string;
  name: string;
  name_hi: string | null;
  emoji: string;
  category: string;
  collectable: boolean;
  donatable: boolean;
  what_to_do: string;
  why: string;
  what_not_to_do: string;
  prep_tips: string | null;
  safety_notes: string | null;
  common_mistakes: string | null;
  reuse_tip: string | null;
  local_note: string | null;
  lesson_slug: string | null;
  has_clarify: boolean;
}

export interface Address {
  id: number;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  pincode: string | null;
  lat: number;
  lng: number;
  is_default: boolean;
}

// ── AI ───────────────────────────────────────────────────────────────────────
export type ActionType = "schedule_pickup" | "donate" | "dropoff" | "learn" | "open";

export interface ChatAction {
  type: ActionType;
  label: string;
  params: Record<string, string>;
}

export interface ChatPayload {
  kind: "answer" | "clarify" | "category" | "info";
  text: string;
  card: {
    item: { slug: string; name: string; emoji: string } | null;
    category: { slug: string; name: string; emoji: string; color: string; collectable: boolean } | null;
    what_to_do: string;
    why: string;
    what_not_to_do: string;
    prep: string | null;
    safety: string | null;
    reuse: string | null;
    local_note: string | null;
  } | null;
  category_guide?: {
    slug: string;
    name: string;
    emoji: string;
    color: string;
    collectable: boolean;
    do: string[];
    dont: string[];
    why: string;
    examples: string[];
  };
  steps?: { emoji: string; title: string; text: string }[];
  clarify: {
    question: string | null;
    options: { label: string; emoji: string; item_slug?: string; category_slug?: string }[];
  } | null;
  actions: ChatAction[];
  learn: { slug: string; title: string; duration_sec: number; emoji: string } | null;
  suggestions: string[];
  source: "knowledge_base" | "ai";
  confidence: "high" | "medium" | "low";
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  payload: ChatPayload | null;
  feedback: number | null;
  created_at: string;
}

// ── Learning ─────────────────────────────────────────────────────────────────
export interface Lesson {
  id: number;
  slug: string;
  title: string;
  title_hi: string | null;
  category: string;
  description: string;
  description_hi: string | null;
  duration_sec: number;
  emoji: string;
  thumbnail_url: string | null;
  has_video: boolean;
  points: number;
  has_quiz: boolean;
  progress_pct: number;
  completed: boolean;
  video_url?: string | null;
  slides?: { emoji: string; text: string; text_hi: string }[];
  quiz_id?: number | null;
}

export interface Quiz {
  id: number;
  title: string;
  pass_pct: number;
  points: number;
  lesson_slug: string | null;
  questions: { id: number; question: string; question_hi: string | null; options: { text: string; text_hi: string }[] }[];
}

export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  points: number;
  improved: boolean;
  previous_best: number | null;
  results: {
    question_id: number;
    selected: number | null;
    correct_index: number;
    correct: boolean;
    explanation: string;
    explanation_hi: string | null;
  }[];
}

export interface Goal {
  key: string;
  label: string;
  label_hi: string;
  progress: number;
  target: number;
}

export interface DailyOverview {
  tip: { id: number; text: string; text_hi: string | null; category: string | null } | null;
  challenge: { id: number; text: string; text_hi: string | null } | null;
  tip_read: boolean;
  challenge_done: boolean;
  streaks: Record<"learning" | "segregation", { current: number; longest: number }>;
  goals: { weekly: Goal[]; monthly: Goal[] };
}

// ── Pickups ──────────────────────────────────────────────────────────────────
export type PickupStatus =
  | "requested"
  | "assigned"
  | "accepted"
  | "on_the_way"
  | "arrived"
  | "collected"
  | "verified"
  | "completed"
  | "cancelled";

export interface PickupItem {
  category: string;
  estimated_kg: number;
  actual_kg: number | null;
  verified_kg: number | null;
}

export interface Pickup {
  code: string;
  status: PickupStatus;
  purpose: "recycle" | "donate";
  scheduled_date: string;
  slot: string;
  items: PickupItem[];
  estimated_total_kg: number;
  actual_total_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  timeline: { status: PickupStatus; note: string | null; at: string }[];
  flow: PickupStatus[];
  proof_url: string | null;
  verification: { total_kg: number; quality: "good" | "fair" | "poor"; notes: string | null } | null;
  address: { text: string; landmark: string | null; lat: number; lng: number; city?: string };
  partner?: { code: string; vehicle: string | null; rating: number | null; phone: string | null; id?: number } | null;
  customer?: { code: string; phone: string | null };
  tracking?: { lat: number; lng: number; distance_km: number; eta_min: number; live: boolean } | null;
  journey?: {
    category: string;
    kg: number;
    recycler: string | null;
    city?: string | null;
    method: string | null;
    status: string;
    order_code?: string;
  }[];
  my_rating?: number | null;
  distance_km?: number;
}

export interface Slot {
  slot: string;
  label: string;
  remaining: number;
  available: boolean;
}

export interface DropOff {
  id: number;
  name: string;
  kind: "recycling_center" | "ewaste_bin" | "donation_box" | "swacchify_hub";
  accepted_categories: string[];
  address: string;
  city: string;
  lat: number;
  lng: number;
  hours: string | null;
  phone: string | null;
  distance_km: number | null;
}

// ── Rewards, impact, household ───────────────────────────────────────────────
export interface RewardSummary {
  balance: number;
  total_earned: number;
  redeemed: number;
  pending: number;
}

export interface RewardItem {
  id: number;
  title: string;
  title_hi: string | null;
  description: string;
  emoji: string;
  points_cost: number;
  in_stock: boolean;
}

export interface RewardTxn {
  id: number;
  type: "earn" | "redeem" | "adjust";
  source: string;
  points: number;
  status: "pending" | "credited" | "fulfilled" | "cancelled";
  description: string;
  created_at: string;
}

export interface Badge {
  slug: string;
  name: string;
  name_hi: string;
  emoji: string;
  description: string;
  earned: boolean;
  progress: number;
  hint: string;
  awarded_at: string | null;
}

export interface ImpactSummary {
  total_kg: number;
  recycled_kg: number;
  donated_kg: number;
  pickups: number;
  co2e_kg_est: number;
  by_category: { category: string; name: string; name_hi: string; emoji: string; color: string; kg: number }[];
  monthly: { month: string; kg: number }[];
  methodology: string;
}

export interface Household {
  id: number;
  name: string;
  invite_code: string;
  city: string | null;
  is_owner: boolean;
  members: { id: number; display_name: string; relation: string | null; is_admin: boolean; has_app: boolean; is_me: boolean }[];
  stats: {
    waste_diverted_kg: number;
    pickups: number;
    current_streak: number;
    by_category: ImpactSummary["by_category"];
    learning_progress_pct: number;
    co2e_kg_est: number;
  };
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  read: boolean;
  created_at: string;
}
