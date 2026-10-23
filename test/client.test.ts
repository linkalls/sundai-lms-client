import { describe, expect, test } from "bun:test";
import { SundaiLmsClient } from "../src/index";

describe("SundaiLmsClient", () => {
  test("adds read-only LMS authentication headers and camelizes JSON", async () => {
    let request: Request | undefined;
    const client = new SundaiLmsClient({
      auth: { token: "token", client: "client", uid: "uid" },
      baseUrl: "https://api.example.test/api",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return new Response(JSON.stringify({ id: 42, student_no: "123", full_name: "Poteto" }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    await expect(client.getProfile()).resolves.toEqual({ id: 42, studentNo: "123", fullName: "Poteto" });
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("tnd-from")).toBe("user");
    expect(request?.headers.get("access-token")).toBe("token");
  });


  test("reads mock-exam records from the signed-in student profile", async () => {
    let request: Request | undefined;
    const client = new SundaiLmsClient({
      auth: { token: "example-token", client: "example-client", uid: "example-uid" },
      baseUrl: "https://api.example.test/api",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return new Response(
          JSON.stringify({
            id: 42,
            exam_results: {
              items: [{
                year: 2026,
                name: "2026 Mock Exam",
                subjects: [{ name: "English", score: 63, full_score: 100, deviation: 58.5 }],
                judgement_details: [{ university_name: "Sample University", judgement_rank: "B" }],
              }],
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const detail = await client.getMyDetail();
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe("https://api.example.test/api/users/my_detail");
    expect(request?.headers.get("tnd-from")).toBe("user");
    expect(detail.examResults?.items?.[0]?.subjects?.[0]?.fullScore).toBe(100);
    expect(detail.examResults?.items?.[0]?.judgementDetails?.[0]?.judgementRank).toBe("B");
  });

  test("does not declare a message-send method", () => {
    const client = new SundaiLmsClient({ auth: { token: "token", client: "client", uid: "uid" } });
    expect("listChats" in client).toBe(true);
    expect("sendMessage" in client).toBe(false);
  });
});

describe("student read-only endpoints", () => {
  const auth = { token: "test-token", client: "test-client", uid: "test-uid" };

  test("getExamResults extracts mock exams from my_detail", async () => {
    const seen: string[] = [];
    const lms = new SundaiLmsClient({
      auth,
      baseUrl: "https://example.test/api",
      fetch: async (input) => {
        seen.push(String(input));
        return Response.json({
          id: 7,
          exam_results: {
            total: 1,
            items: [
              {
                name: "Demo exam",
                subjects: [{ name: "Japanese History", score: 85, full_score: 100 }],
                judgement_details: [{ university_name: "Demo University", judgement_rank: "A" }],
              },
            ],
          },
        });
      },
    });

    const exams = await lms.getExamResults();
    expect(exams).toHaveLength(1);
    expect(exams[0]?.subjects?.[0]?.fullScore).toBe(100);
    expect(exams[0]?.judgementDetails?.[0]?.judgementRank).toBe("A");
    expect(seen).toEqual(["https://example.test/api/users/my_detail"]);
  });

  test("calendar_entries sends the required date range and accepts entries", async () => {
    let captured: Request | undefined;
    const lms = new SundaiLmsClient({
      auth,
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return Response.json({ entries: [{ id: 3, title: "Class" }] });
      },
    });

    const result = await lms.listCalendarEntries("20261001", "20261031");
    expect(result.items).toEqual([{ id: 3, title: "Class" }]);
    expect(captured?.url).toContain("from_date=20261001");
    expect(captured?.url).toContain("to_date=20261031");
    expect(captured?.method).toBe("GET");
  });

  test("learning statistics uses subject_id, not subjectId", async () => {
    let captured: Request | undefined;
    const lms = new SundaiLmsClient({
      auth,
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return Response.json({ total_study_minutes: 60, items: [] });
      },
    });

    const result = await lms.getLearningActivityStats(123);
    expect(result.totalStudyMinutes).toBe(60);
    expect(captured?.url).toContain("subject_id=123");
    expect(captured?.method).toBe("GET");
  });

  test("my chat is an object, not a paginated list", async () => {
    const lms = new SundaiLmsClient({
      auth,
      fetch: async () => Response.json({ id: 17, chat_messages: [{ id: 1 }] }),
    });

    const myChat = await lms.getMyChat();
    expect(myChat.id).toBe(17);
    expect(myChat.chatMessages).toEqual([{ id: 1 }]);
  });
});

describe("announcement attachments", () => {
  const auth = { token: "test-token", client: "test-client", uid: "test-uid" };

  test("downloads every PDF of a multi-attachment announcement without marking it read", async () => {
    const requested: string[] = [];
    const client = new SundaiLmsClient({
      auth,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requested.push(`${request.method} ${request.url}`);

        if (request.url.endsWith("/api/contacts/7")) {
          return Response.json({
            id: 7,
            title: "Example notice",
            contact_attachments: [
              {
                id: 21,
                document: {
                  id: 101,
                  display_name: "first.pdf",
                  document_type: "application/pdf",
                  file_url: "/documents/101/file",
                },
              },
              {
                id: 22,
                document: {
                  id: 102,
                  display_name: "second.pdf",
                  document_type: "application/pdf",
                  file_url: "/documents/102/file",
                },
              },
              {
                id: 23,
                document: {
                  id: 103,
                  display_name: "third.pdf",
                  document_type: "application/pdf",
                  file_url: "/api/documents/103/file",
                },
              },
            ],
          });
        }

        const url = new URL(request.url);
        if (/^\/api\/documents\/(101|102|103)\/file$/.test(url.pathname)) {
          return new Response(new TextEncoder().encode(`pdf-content-${url.pathname.split("/")[3]}`), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          });
        }

        throw new Error(`Unexpected test request: ${request.url}`);
      },
    });

    const files = await client.downloadContactAttachments(7);
    expect(files).toHaveLength(3);
    expect(files.map((file) => file.fileName)).toEqual(["first.pdf", "second.pdf", "third.pdf"]);
    expect(files.map((file) => file.contentType)).toEqual(["application/pdf", "application/pdf", "application/pdf"]);
    expect(await Promise.all(files.map((file) => file.response.text()))).toEqual([
      "pdf-content-101", "pdf-content-102", "pdf-content-103",
    ]);
    expect(requested).toEqual([
      "GET https://api.lms.sundai-edfu.com/api/contacts/7",
      "GET https://api.lms.sundai-edfu.com/api/documents/101/file",
      "GET https://api.lms.sundai-edfu.com/api/documents/102/file",
      "GET https://api.lms.sundai-edfu.com/api/documents/103/file",
    ]);
  });

  test("retrieves a missing document URL using its metadata endpoint", async () => {
    const requested: string[] = [];
    const client = new SundaiLmsClient({
      auth,
      fetch: async (input) => {
        const url = new URL(String(input));
        requested.push(url.pathname);
        if (url.pathname === "/api/contacts/8") {
          return Response.json({ id: 8, contact_attachments: [{ id: 31, document: { id: 501 } }] });
        }
        if (url.pathname === "/api/documents/501") {
          return Response.json({ id: 501, display_name: "attachment.pdf", file_url: "/documents/501/file" });
        }
        if (url.pathname === "/api/documents/501/file") {
          return new Response("attachment bytes", { headers: { "content-type": "application/pdf" } });
        }
        throw new Error(`Unexpected test path: ${url.pathname}`);
      },
    });

    const files = await client.downloadContactAttachments(8);
    expect(files).toHaveLength(1);
    expect(files[0]?.fileName).toBe("attachment.pdf");
    expect(await files[0]?.response.text()).toBe("attachment bytes");
    expect(requested).toEqual(["/api/contacts/8", "/api/documents/501", "/api/documents/501/file"]);
  });

  test("returns an empty array when the notice has no attachments", async () => {
    const client = new SundaiLmsClient({
      auth,
      fetch: async () => Response.json({ id: 2, contact_attachments: [] }),
    });
    expect(await client.downloadContactAttachments(2)).toEqual([]);
  });

  test("rejects an external URL before sending authentication headers", async () => {
    let requests = 0;
    const client = new SundaiLmsClient({
      auth,
      fetch: async () => {
        requests += 1;
        throw new Error("Unexpected network request");
      },
    });

    await expect(client.downloadDocumentUrl("https://example.invalid/file.pdf")).rejects.toThrow(
      "Refusing to send LMS credentials",
    );
    expect(requests).toBe(0);
  });
});
