// VaultCheck demo: capture scene frames and the real dashboard top.
// Run: node capture-scenes.js
const puppeteer = require("/home/hatch/workspace/hyper-elements-sown/node_modules/puppeteer-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

const VIDEO = path.join(os.homedir(), "workspace/terminal3-micro-grant/video");
const DOCS = path.join(os.homedir(), "workspace/terminal3-micro-grant/vaultcheck/docs");
const EXE = path.join(os.homedir(), ".cache/ms-playwright/chromium-1255/chrome-linux64/chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXE, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();

  // Real dashboard top strip for the scene 6 inset.
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(DOCS, "dashboard.html"), { waitUntil: "networkidle0" });
  await sleep(600);
  await page.screenshot({ path: path.join(VIDEO, "scenes/dashboard-full.png") });

  // Scene frames, one element shot per scene.
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(VIDEO, "scenes/scenes.html"), { waitUntil: "networkidle0" });
  await sleep(500);
  for (let i = 1; i <= 6; i++) {
    const el = await page.$("#scene" + i);
    if (!el) throw new Error("missing scene" + i);
    await el.screenshot({ path: path.join(VIDEO, `scenes/scene${i}.png`) });
    console.log("captured scene" + i);
  }
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
