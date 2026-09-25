/**
 * Offline tests for the shared UI helpers (assets/js/ui.js).
 *
 * The important one is safeImage. Profile photographs legitimately arrive as data: URLs, which the
 * link checker deliberately refuses — that mismatch is what made uploaded photos vanish. Widening
 * it for pictures must not widen it for anything that could run.
 *
 *   node tests/ui.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null };
// eslint-disable-next-line no-eval
(0, eval)(readFileSync(join(ROOT, "assets", "js", "ui.js"), "utf8"));
const { safeImage, safeUrl, avatar, esc } = globalThis.CPCA.ui;

let failed = 0;
const ok = (name, cond) => { console.log((cond ? "  ok   " : "  FAIL ") + name); if (!cond) failed++; };

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocABC123=s320-c";

console.log("\nPhotographs that must be shown");
ok("an uploaded JPEG data URL", safeImage(JPEG) === JPEG);
ok("an uploaded PNG data URL", safeImage(PNG) === PNG);
ok("a WebP data URL", safeImage("data:image/webp;base64,UklGRg==") === "data:image/webp;base64,UklGRg==");
ok("the picture Google gives us", safeImage(GOOGLE) === GOOGLE);

console.log("\nAnything that could run must still be refused");
for (const bad of [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+",
  "data:image/svg+xml,<svg onload=alert(1)>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "data:image/jpeg;base64,abc\" onerror=\"alert(1)",
  "data:image/jpeg;utf8,<script>alert(1)</script>",
]) ok(`refuses ${bad.slice(0, 44)}`, safeImage(bad) === "");

console.log("\nEdge cases");
ok("empty string", safeImage("") === "");
ok("null", safeImage(null) === "");
ok("undefined", safeImage(undefined) === "");
ok("plain http is refused (the site is https)", safeImage("http://example.com/a.jpg") === "");
ok("not a URL at all", safeImage("just some words") === "");

console.log("\nsafeUrl, for links members type, is unchanged");
ok("still refuses a data URL", safeUrl(JPEG) === "");
ok("still refuses javascript:", safeUrl("javascript:alert(1)") === "");
ok("still accepts an ordinary link", safeUrl("https://linkedin.com/in/someone") === "https://linkedin.com/in/someone");

console.log("\nWhat the avatar actually renders");
const withPhoto = avatar({ full_name: "Rakesh Jha", photo_url: JPEG }, true);
ok("an uploaded photo produces an <img>", /^<img /.test(withPhoto) && withPhoto.includes(esc(JPEG)));
ok("the large variant keeps its class", withPhoto.includes('class="avatar lg"'));
ok("a photo that fails to load falls back to initials", withPhoto.includes("data-fallback=") && withPhoto.includes("onerror="));

const noPhoto = avatar({ full_name: "Rakesh Jha", photo_url: null });
ok("no photo produces initials, not an image", /^<span /.test(noPhoto) && noPhoto.includes(">RJ<"));

const hostile = avatar({ full_name: "Rakesh Jha", photo_url: "javascript:alert(1)" });
ok("a hostile photo value renders initials and no <img>", /^<span /.test(hostile) && !hostile.includes("<img"));
ok("and does not carry the payload through", !hostile.includes("javascript:"));

console.log(failed ? `\n${failed} check(s) failed\n` : "\nAll checks passed\n");
process.exit(failed ? 1 : 0);
