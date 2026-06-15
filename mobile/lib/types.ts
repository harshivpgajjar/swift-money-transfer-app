export type UserRole = "distributor" | "fos" | "retailer";

export type RequestFosStatus = "pending" | "accepted" | "edited" | "declined";
export type ApprovalStatus = "pending" | "approved" | "declined";
export type EodTxnType = "transfer" | "reversal";

/* Slugs are distributor-defined; "swift" and "naomi" are the built-ins. */
export type AccountSlug = string;

export type Account = {
  id: string;
  distributor_id: string;
  name: string;
  slug: AccountSlug;
  active: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  retailer_code: string | null;
  fos_id: string | null;
  distributor_id: string | null;
  active: boolean;
  needs_assignment: boolean;
  fos_auto_approve: boolean;
  timezone: string;
  must_change_password: boolean;
  notification_prefs: Record<string, boolean> | null;
  default_fos_auto_approve: boolean;
  created_at: string;
  updated_at: string;
};

export const ROLE_HOME: Record<UserRole, string> = {
  distributor: "/(distributor)",
  fos: "/(fos)",
  retailer: "/(retailer)",
};
