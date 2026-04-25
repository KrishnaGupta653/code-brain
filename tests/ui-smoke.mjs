import { chromium } from "playwright";

const url = process.env.CODE_BRAIN_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    pageErrors.push(message.text());
  }
});

try {
  const response = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  if (!response?.ok()) {
    throw new Error(`Expected ${url} to respond OK, got ${response?.status()}`);
  }

  await page.getByText("code-brain").first().waitFor({ timeout: 10000 });
  await page.getByText("Node Types").waitFor({ timeout: 10000 });

  const canvasCount = await page.locator("canvas").count();
  if (canvasCount === 0) {
    throw new Error("Expected Sigma canvas elements to render");
  }

  if (pageErrors.length > 0) {
    throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);
  }
} finally {
  await browser.close();
}
