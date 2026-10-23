import type {
  CalendarEntry,
  Chat,
  Contact,
  ExportOptions,
  UserDetails,
  Handout,
  JsonObject,
  LmsDocument,
  LmsResource,
  Paginated,
  Query,
  SundaiLmsAuth,
  SundaiLmsExport,
  SundaiLmsSession,
  Survey,
} from "./types";

export const SUNDAI_LMS_API_BASE_URL = "https://api.lms.sundai-edfu.com/api";

/** Minimal fetch signature, injectable for tests without Bun-specific static members. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SundaiLmsClientOptions {
  auth: SundaiLmsAuth;
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface EmailPasswordLoginOptions {
  email: string;
  password: string;
  fetch?: FetchLike;
}

/** Raised when the LMS rejects a request or returns malformed JSON. */
export class SundaiLmsApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  public constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SundaiLmsApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * API client for the student's own LMS account.
 *
 * The library exposes student-owned API routes, including read-only helpers.
 * No administrator/master endpoints are included.
 */
export class SundaiLmsClient {
  private readonly auth: SundaiLmsAuth;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  public constructor(options: SundaiLmsClientOptions) {
    this.auth = options.auth;
    this.baseUrl = (options.baseUrl ?? SUNDAI_LMS_API_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Logs in through the same email/password SSO form used by the LMS website.
   * The password is used only for this request and is never stored in a session.
   */
  public static async loginWithEmailPassword(options: EmailPasswordLoginOptions): Promise<SundaiLmsSession> {
    const fetchImpl = options.fetch ?? fetch;
    const jar = new CookieJar();
    const authorizationUrl = new URL("https://api.sundai.ac.jp/allms-oauth/api/v1/authorization");
    authorizationUrl.search = new URLSearchParams({
      redirect_uri: "https://api.lms.sundai-edfu.com/api/auth/callback",
      response_type: "code",
      client_id: "16837480142010",
      scope: "openid",
      state: crypto.randomUUID(),
      code_challenge: "G2-FmZstlFipzHv1PuZnJ-To87reYNzCZhgPeUGINxE",
      code_challenge_method: "S256",
    }).toString();

    const authorization = await fetchImpl(authorizationUrl, { redirect: "manual" });
    jar.capture(authorization, authorizationUrl);
    if (!authorization.ok) throw await loginError("Could not open the Sundai SSO login form", authorization);

    const decisionUrl = new URL("/allms-oauth/api/v1/authorization/decision", authorizationUrl.origin);
    const decision = await fetchImpl(decisionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: jar.headerFor(decisionUrl),
      },
      body: new URLSearchParams({ loginId: options.email, password: options.password, authorized: "ログイン" }),
    });
    jar.capture(decision, decisionUrl);

    const callback = redirectLocation(decision, decisionUrl);
    if (!callback) throw await loginError("Sundai SSO did not accept the email address or password", decision);

    const callbackResponse = await fetchImpl(callback, {
      redirect: "manual",
      headers: { cookie: jar.headerFor(callback) },
    });
    jar.capture(callbackResponse, callback);
    const encodedPayload = jar.get("lms_auth_payload");
    if (!encodedPayload) throw await loginError("LMS did not issue a session after SSO login", callbackResponse);

    const auth = decodeAuthPayload(encodedPayload);
    return { version: 1, savedAt: new Date().toISOString(), auth };
  }

  public static fromSession(session: SundaiLmsSession, options: Omit<SundaiLmsClientOptions, "auth"> = {}): SundaiLmsClient {
    if (session.version !== 1) throw new Error(`Unsupported Sundai LMS session version: ${session.version}`);
    return new SundaiLmsClient({ ...options, auth: session.auth });
  }

  public toSession(): SundaiLmsSession {
    return { version: 1, savedAt: new Date().toISOString(), auth: { ...this.auth } };
  }

  /** Retrieves the currently authenticated student's account profile. */
  public async getProfile(): Promise<LmsResource> {
    return this.getJson<LmsResource>("users/me");
  }

  /** Retrieves all student-owned details, including exam_results.items. */
  public async getMyDetail(): Promise<UserDetails> {
    return this.getJson<UserDetails>("users/my_detail");
  }

  /** Convenience accessor for the student’s mock-exam records. */
  public async getExamResults(): Promise<NonNullable<NonNullable<UserDetails["examResults"]>["items"]>> {
    const detail = await this.getMyDetail();
    return detail.examResults?.items ?? [];
  }

  /** User notifications (as distinct from announcements /contacts). */
  public async listUserNotifications(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("user_notifications", query);
  }

  public async listFullUserNotifications(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("user_notifications/full", query);
  }

  public async getWeeklySurveyData(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("user_surveys/my_weekly_data", query);
  }

  public async listFavoriteSubjects(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("favorite_subjects", query);
  }

  /** Learning activity and statistics require a subject_id query parameter. */
  public async listLearningActivities(subjectId: string | number): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("al_activities/me", { subjectId });
  }

  public async getLearningActivityStats(subjectId: string | number): Promise<JsonObject> {
    return this.getJson<JsonObject>("al_activity_stats/me", { subjectId });
  }

  public async listUserContactTags(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("user_contact_tags", query);
  }

  public async listDocumentDirectories(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("document_directories", query);
  }

  public async listStudyPlans(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("study_plans", query);
  }

  public async getStudyPlan(id: string | number): Promise<LmsResource> {
    return this.getJson<LmsResource>(`study_plans/${encodeURIComponent(String(id))}`);
  }

  public async listHandoutTags(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("handout_tags/list", query);
  }

  public async getClassSurveyPeriods(): Promise<JsonObject> {
    return this.getJson<JsonObject>("class_survey_periods");
  }

  public async listClassroomTeachers(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("classrooms/admin_users", query);
  }

  /** Dates are required by Sundai as YYYYMMDD, e.g. 20261023. */
  public async listInterviewBookings(fromDate: string, toDate: string): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("interview_bookings", { fromDate, toDate });
  }

  public async getBooking(id: string | number): Promise<LmsResource> {
    return this.getJson<LmsResource>(`bookings/${encodeURIComponent(String(id))}`);
  }

  public async getSubmission(id: string | number): Promise<LmsResource> {
    return this.getJson<LmsResource>(`submissions/${encodeURIComponent(String(id))}`);
  }

  public async listContacts(query: Query = {}): Promise<Paginated<Contact>> {
    return this.list<Contact>("contacts", query);
  }

  public async getContact(id: string | number): Promise<Contact> {
    return this.getJson<Contact>(`contacts/${encodeURIComponent(String(id))}`);
  }

  /** Marks an announcement as read in the LMS. */
  public async markContactRead(id: string | number): Promise<void> {
    await this.requestJson<void>(`contacts/${encodeURIComponent(String(id))}/read`, { method: "POST" });
  }

  public async listHandouts(query: Query = {}): Promise<Paginated<Handout>> {
    return this.list<Handout>("handouts", query);
  }

  public async getHandoutFile(id: string | number): Promise<Response> {
    return this.getResponse(`handouts/${encodeURIComponent(String(id))}/file`);
  }

  public async listSurveys(query: Query = {}): Promise<Paginated<Survey>> {
    return this.list<Survey>("user_surveys", query);
  }

  public async getSurvey(id: string | number): Promise<Survey> {
    return this.getJson<Survey>(`user_surveys/${encodeURIComponent(String(id))}`);
  }

  /** Saves a survey response. Pass the answer payload exactly as returned by `getSurvey`. */
  public async updateSurvey(id: string | number, payload: JsonObject): Promise<Survey> {
    return this.requestJson<Survey>(`user_surveys/${encodeURIComponent(String(id))}`, {
      method: "PUT",
      body: payload,
    });
  }

  /** Calendar endpoint requires from_date and to_date (YYYYMMDD). */
  public async listCalendarEntries(fromDate: string, toDate: string): Promise<Paginated<CalendarEntry>> {
    return this.list<CalendarEntry>("calendar_entries", { fromDate, toDate });
  }

  /** Lists LMS subjects that annotate class work and handouts. */
  public async listSubjects(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("subjects", query);
  }

  /** Lists LMS teachers. This is metadata only; it cannot contact anyone. */
  public async listTeachers(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("teachers", query);
  }

  public async listContactTags(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("contact_tags", query);
  }

  public async listHandoutCategories(query: Query = {}): Promise<Paginated<LmsResource>> {
    return this.list<LmsResource>("handout_categories/list", query);
  }

  public async getDocument(id: string | number): Promise<LmsDocument> {
    return this.getJson<LmsDocument>(`documents/${encodeURIComponent(String(id))}`);
  }

  /** Lists message threads for the current account. This does not send anything. */
  /** /chats/me is a single chat object, not an { items: [] } list. */
  public async getMyChat(): Promise<Chat> {
    return this.getJson<Chat>("chats/me");
  }

  /** Compatibility method for consumers expecting a paginated shape. */
  public async listChats(): Promise<Paginated<Chat>> {
    const chat = await this.getMyChat();
    return { items: [chat], raw: chat };
  }

  /** Retrieves one message thread. This does not change its read state. */
  public async getChat(id: string | number): Promise<Chat> {
    return this.getJson<Chat>(`chats/${encodeURIComponent(String(id))}`);
  }

  /** Marks a message thread as read. There is intentionally no send-message API. */
  public async markChatRead(id: string | number): Promise<void> {
    await this.requestJson<void>(`chats/${encodeURIComponent(String(id))}/read`, { method: "POST" });
  }

  /** Downloads a document URL included in a read-only LMS response. */
  public async downloadDocumentUrl(url: string): Promise<Response> {
    const target = new URL(url, `${this.baseUrl}/`);
    const apiOrigin = new URL(this.baseUrl).origin;
    if (target.origin !== apiOrigin && target.origin !== "https://lms.sundai-edfu.com") {
      throw new Error(`Refusing to send LMS credentials to an unexpected origin: ${target.origin}`);
    }
    return this.request(target);
  }

  /** Fetches every page of every read-only, exportable LMS category. */
  public async exportAll(options: ExportOptions = {}): Promise<SundaiLmsExport> {
    const maxPages = options.maxPages ?? 500;
    const [profile, contactSummaries, handouts, surveySummaries, calendarEntries, subjects, teachers, contactTags, handoutCategories, chats] = await Promise.all([
      this.getProfile(),
      this.collectAll<Contact>("contacts", options.contacts, maxPages),
      this.collectAll<Handout>("handouts", options.handouts, maxPages),
      this.collectAll<Survey>("user_surveys", options.surveys, maxPages),
      this.collectAll<CalendarEntry>("calendar_entries", options.calendarEntries ?? defaultCalendarQuery(), maxPages),
      this.collectAll<LmsResource>("subjects", options.subjects, maxPages),
      this.collectAll<LmsResource>("teachers", options.teachers, maxPages),
      this.collectAll<LmsResource>("contact_tags", options.contactTags, maxPages),
      this.collectAll<LmsResource>("handout_categories/list", options.handoutCategories, maxPages),
      this.getMyChat(),
    ]);

    const [contacts, surveys] = await Promise.all([
      this.hydrate(contactSummaries, (item) => this.getContact(item.id)),
      this.hydrate(surveySummaries, (item) => this.getSurvey(item.id)),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile,
      contacts,
      handouts,
      surveys,
      calendarEntries,
      subjects,
      teachers,
      contactTags,
      handoutCategories,
      chats: [chats],
    };
  }

  private async list<T extends LmsResource>(path: string, query: Query): Promise<Paginated<T>> {
    const raw = await this.getJson<unknown>(path, query);
    return { items: extractItems<T>(raw), raw };
  }

  private async collectAll<T extends LmsResource>(
    path: string,
    query: Query | undefined,
    maxPages: number,
  ): Promise<T[]> {
    const collected: T[] = [];
    const seenIds = new Set<string>();

    for (let page = 1; page <= maxPages; page += 1) {
      const result = await this.list<T>(path, { ...query, page });
      if (result.items.length === 0) break;

      let added = 0;
      for (const item of result.items) {
        const key = String(item.id);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          collected.push(item);
          added += 1;
        }
      }

      // The LMS sometimes returns an unpaginated array. Avoid repeating page 1 forever.
      if (added === 0 || !hasAnotherPage(result.raw, page, result.items.length)) break;
    }

    return collected;
  }

  /**
   * List endpoints deliberately return summaries. Fetch the corresponding
   * read-only detail endpoint with a small concurrency limit so the archive
   * includes notice bodies and the full survey payload without hammering LMS.
   */
  private async hydrate<T extends LmsResource>(
    summaries: T[],
    getDetail: (item: T) => Promise<T>,
    concurrency = 4,
  ): Promise<T[]> {
    const results = new Array<T>(summaries.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < summaries.length) {
        const index = nextIndex;
        nextIndex += 1;
        const summary = summaries[index];
        if (!summary) continue;
        results[index] = await getDetail(summary);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, summaries.length) }, worker));
    return results;
  }

  private async getJson<T>(path: string, query: Query = {}): Promise<T> {
    return this.requestJson<T>(path, { query });
  }

  private async requestJson<T>(path: string, options: { method?: "GET" | "POST" | "PUT"; body?: JsonObject; query?: Query }): Promise<T> {
    const response = await this.getResponse(path, options.query ?? {}, options.method, options.body);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new SundaiLmsApiError("Expected a JSON response from Sundai LMS", response.status, await response.text());
    }
    return camelize(await response.json()) as T;
  }

  private async getResponse(path: string, query: Query = {}, method = "GET", body?: JsonObject): Promise<Response> {
    const url = new URL(path.replace(/^\/+/, ""), `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(toSnakeCase(key), String(value));
    }
    return this.request(url, { method, body: body ? JSON.stringify(body) : undefined });
  }

  private async request(url: URL, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(url, {
      ...init,
      method: init.method ?? "GET",
      headers: {
        "tnd-from": "user",
        "access-token": this.auth.token,
        client: this.auth.client,
        uid: this.auth.uid,
        accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new SundaiLmsApiError(`Sundai LMS API request failed: ${response.status}`, response.status, body);
    }
    return response;
  }
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  public capture(response: Response, _url: URL): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = headers.getSetCookie?.() ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(";", 1);
      if (!pair) continue;
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  public headerFor(_url: URL): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  public get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

function redirectLocation(response: Response, base: URL): URL | undefined {
  const location = response.headers.get("location");
  return location ? new URL(location, base) : undefined;
}

function decodeAuthPayload(encodedPayload: string): SundaiLmsAuth {
  let payload: unknown;
  try {
    payload = JSON.parse(atob(encodedPayload));
  } catch {
    throw new Error("The LMS returned an invalid session payload");
  }
  if (!payload || typeof payload !== "object") throw new Error("The LMS returned an invalid session payload");
  const record = payload as Record<string, unknown>;
  if (typeof record.token !== "string" || typeof record.client !== "string" || typeof record.uid !== "string") {
    throw new Error("The LMS session payload did not include API credentials");
  }
  return { token: record.token, client: record.client, uid: record.uid };
}

async function loginError(message: string, response: Response): Promise<SundaiLmsApiError> {
  return new SundaiLmsApiError(message, response.status, await readErrorBody(response));
}

function extractItems<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: T[] }).items;
  }
  // Calendar and bookings use `entries`, not `items`.
  if (raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)) {
    return (raw as { entries: T[] }).entries;
  }
  throw new SundaiLmsApiError("The LMS list response did not include an items array", 200, raw);
}

function hasAnotherPage(raw: unknown, currentPage: number, itemCount: number): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const pagination = (record.pagination ?? record.meta) as Record<string, unknown> | undefined;
  const totalPages = Number(pagination?.totalPages ?? pagination?.total_pages);
  if (Number.isFinite(totalPages) && totalPages > 0) return currentPage < totalPages;
  const nextPage = pagination?.nextPage ?? pagination?.next_page;
  if (nextPage !== undefined && nextPage !== null) return true;
  return itemCount > 0;
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()),
      camelize(child),
    ]),
  );
}

async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    return contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    return null;
  }
}

/** Default to a bounded calendar interval when exporting all student data. */
function defaultCalendarQuery(): Query {
  const now = new Date();
  // Use the Japan-local calendar date because the LMS is a Japanese service.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string): string => parts.find((p) => p.type === name)?.value ?? "";
  const localDay = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
  const before = new Date(localDay); before.setUTCDate(before.getUTCDate() - 31);
  const after = new Date(localDay); after.setUTCDate(after.getUTCDate() + 31);
  const format = (date: Date): string => date.toISOString().slice(0, 10).replaceAll("-", "");
  return { fromDate: format(before), toDate: format(after) };
}
