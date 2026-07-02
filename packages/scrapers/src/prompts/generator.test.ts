import { describe, expect, it } from "vitest";
import { GENERATOR_USER_TEMPLATE, JUDGE_USER_TEMPLATE } from "./generator";

const SHOP_URL = "https://shop.example.ie";

describe("GENERATOR_USER_TEMPLATE", () => {
  it("wraps shopUrl in <shop-url> tags", () => {
    const out = GENERATOR_USER_TEMPLATE(SHOP_URL, "<html></html>");
    expect(out).toContain(`<shop-url>${SHOP_URL}</shop-url>`);
  });

  it("wraps html in <page-html> tags", () => {
    const html = "<html><body>hello</body></html>";
    const out = GENERATOR_USER_TEMPLATE(SHOP_URL, html);
    expect(out).toContain(`<page-html>\n${html}\n</page-html>`);
  });

  it("truncates html at 30 000 chars", () => {
    const long = "x".repeat(40000);
    const out = GENERATOR_USER_TEMPLATE(SHOP_URL, long);
    expect(out).toContain("x".repeat(30000));
    expect(out).not.toContain("x".repeat(30001));
  });

  it("does not truncate html shorter than 30 000 chars", () => {
    const short = "y".repeat(100);
    const out = GENERATOR_USER_TEMPLATE(SHOP_URL, short);
    expect(out).toContain(short);
  });
});

describe("JUDGE_USER_TEMPLATE", () => {
  it("wraps shopUrl in <shop-url> tags", () => {
    const out = JUDGE_USER_TEMPLATE(SHOP_URL, "const x = 1;");
    expect(out).toContain(`<shop-url>${SHOP_URL}</shop-url>`);
  });

  it("wraps bundleJs in <generated-bundle> tags with code fences", () => {
    const bundle = "module.exports = {};";
    const out = JUDGE_USER_TEMPLATE(SHOP_URL, bundle);
    expect(out).toContain("<generated-bundle>");
    expect(out).toContain("</generated-bundle>");
    expect(out).toContain("```js\n" + bundle);
  });

  it("truncates bundleJs at 8 000 chars", () => {
    const long = "a".repeat(10000);
    const out = JUDGE_USER_TEMPLATE(SHOP_URL, long);
    expect(out).toContain("a".repeat(8000));
    expect(out).not.toContain("a".repeat(8001));
  });
});
