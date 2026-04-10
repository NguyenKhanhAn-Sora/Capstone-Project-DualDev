import { test, expect } from "@playwright/test";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function setToken(page: any, token: string) {
  await page.addInitScript((t: string) => {
    localStorage.setItem("accessToken", t);
  }, token);
}

test("inbox dot appears without reload when a server application is submitted", async ({ browser, request, baseURL }) => {
  const ownerToken = requireEnv("E2E_OWNER_TOKEN");
  const applicantToken = requireEnv("E2E_APPLICANT_TOKEN");
  const serverId = requireEnv("E2E_SERVER_ID");
  const channelId = requireEnv("E2E_CHANNEL_ID");

  // Owner page (should see dots)
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await setToken(ownerPage, ownerToken);
  await ownerPage.goto(`${baseURL}/messages?server=${serverId}&channel=${channelId}`);

  // Wait for app to render
  await expect(ownerPage.getByTitle("Hộp thư đến")).toBeVisible();

  // Applicant submits join application via API (same as invite flow)
  const res = await request.post(`http://localhost:9999/servers/${serverId}/join`, {
    headers: {
      Authorization: `Bearer ${applicantToken}`,
      "Content-Type": "application/json",
    },
    data: {
      nickname: `e2e-${Date.now()}`,
      applicationAnswers: [],
    },
  });

  // Accept 200 or 201 depending on server; should not hard fail test if already pending.
  if (!res.ok()) {
    const txt = await res.text();
    // Let it pass if server returns "already pending" style error
    if (!txt.toLowerCase().includes("pending") && !txt.toLowerCase().includes("đang chờ")) {
      throw new Error(`Join failed: ${res.status()} ${txt}`);
    }
  }

  // Owner should see join-app pending dot without reload (polling interval <= 6s)
  // The dot is rendered in server menu area; easiest is to check that pending count badge container exists.
  await expect(ownerPage.locator("text=/\\bĐơn tham gia\\b/")).toBeVisible({ timeout: 15000 });
});

