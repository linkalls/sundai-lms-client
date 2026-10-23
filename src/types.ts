/** Authentication values issued by the LMS after you log in. */
export interface SundaiLmsAuth {
  /** `access-token` response header from the LMS authentication flow. */
  token: string;
  /** `client` response header from the LMS authentication flow. */
  client: string;
  /** `uid` response header from the LMS authentication flow. */
  uid: string;
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;
export type JsonObject = Record<string, unknown>;

/** Serializable local session. Keep this file private: it is equivalent to a login session. */
export interface SundaiLmsSession {
  version: 1;
  savedAt: string;
  auth: SundaiLmsAuth;
}

/**
 * The LMS evolves independently, so every resource preserves unknown fields.
 * Stable, observed fields are typed explicitly; all other fields stay available.
 */
export interface LmsResource {
  id: number | string;
  [key: string]: unknown;
}

/** One scored subject as rendered on /me/profile. */
export interface ExamResultSubject {
  name?: string;
  score?: string | number;
  fullScore?: string | number;
  deviation?: string | number;
  [key: string]: unknown;
}

/** One university judgement attached to a mock exam. */
export interface ExamJudgementDetail {
  seq?: number | string;
  universityName?: string;
  facultyName?: string;
  departmentName?: string;
  majorName?: string;
  examMethod?: string;
  examSchedule?: string;
  deviationValue?: number | string;
  borderRank?: string;
  judgementRank?: string;
  [key: string]: unknown;
}

/** A mock-exam record embedded in the current student's profile. */
export interface ExamResult {
  id?: number | string;
  year?: number | string;
  category?: string;
  name?: string;
  code?: string;
  examType?: string;
  subjects?: ExamResultSubject[];
  judgementDetails?: ExamJudgementDetail[];
  [key: string]: unknown;
}

/** Student-owned profile details returned by GET /users/my_detail. */
export interface UserDetails extends LmsResource {
  examResults?: { items?: ExamResult[]; [key: string]: unknown };
}

export interface LmsDocument extends LmsResource {
  name?: string;
  filename?: string;
  documentType?: string;
  fileUrl?: string;
}

export interface Contact extends LmsResource {
  title?: string;
  content?: string;
  sentAt?: string;
  read?: boolean;
  tags?: LmsResource[];
  userContactTags?: LmsResource[];
  contactAttachments?: Array<LmsResource & { document?: LmsDocument }>;
}

export interface Handout extends LmsResource {
  title?: string;
  description?: string;
  document?: LmsDocument;
}

export interface Survey extends LmsResource {
  title?: string;
  status?: string;
  deadline?: string;
}

export interface CalendarEntry extends LmsResource {
  title?: string;
  startAt?: string;
  endAt?: string;
}

export interface Chat extends LmsResource {
  title?: string;
  read?: boolean;
  messages?: LmsResource[];
}

export interface Paginated<T> {
  items: T[];
  /** The complete LMS response, retained when its pagination shape changes. */
  raw: unknown;
}

export interface SundaiLmsExport {
  exportedAt: string;
  profile: LmsResource;
  contacts: Contact[];
  handouts: Handout[];
  surveys: Survey[];
  calendarEntries: CalendarEntry[];
  subjects: LmsResource[];
  teachers: LmsResource[];
  contactTags: LmsResource[];
  handoutCategories: LmsResource[];
  chats: Chat[];
}

export interface ExportOptions {
  /** Defaults to 500 and prevents a changed API from looping forever. */
  maxPages?: number;
  /** Filter/query values forwarded to the matching LMS endpoint. */
  contacts?: Query;
  handouts?: Query;
  surveys?: Query;
  calendarEntries?: Query;
  subjects?: Query;
  teachers?: Query;
  contactTags?: Query;
  handoutCategories?: Query;
}
