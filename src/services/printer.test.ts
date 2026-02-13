import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { buildLpArgs, print, getPrinterStatus } from "./printer";
import { defaultConfig } from "../types";
import { getPageCount } from "./pdf";
import { PDFDocument } from "pdf-lib";
import { join } from "path";

async function hasPrinter(): Promise<boolean> {
  try {
    const result = await Bun.$`/usr/bin/lpstat -p 2>&1`.text();
    return !result.includes("No destinations");
  } catch {
    return false;
  }
}

const tmpDir = join(import.meta.dir, "../../tmp");
const samplePdf = join(tmpDir, "sample.pdf");

beforeAll(async () => {
  await Bun.$`mkdir -p ${tmpDir}`;

  const doc = await PDFDocument.create();
  const page = doc.addPage();
  page.drawText("Hello, Brother printer!", { x: 50, y: 500, size: 24 });
  const bytes = await doc.save();
  await Bun.write(samplePdf, bytes);
});

afterAll(async () => {
  await Bun.$`rm -f ${samplePdf}`;
});

describe("buildLpArgs", () => {
  test("default config", () => {
    const args = buildLpArgs("/tmp/test.pdf", defaultConfig);
    expect(args).toContain("-d");
    expect(args).toContain("-n");
    expect(args).toContain("1");
    expect(args).toContain("-o");
    expect(args).toContain("media=a4");
    expect(args).toContain("/tmp/test.pdf");
    expect(args).not.toContain("sides=two-sided-long-edge");
    expect(args).not.toContain("landscape");
  });

  test("duplex long-edge", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      duplex: "long-edge",
    });
    expect(args).toContain("sides=two-sided-long-edge");
  });

  test("duplex short-edge", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      duplex: "short-edge",
    });
    expect(args).toContain("sides=two-sided-short-edge");
  });

  test("landscape orientation", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      orientation: "landscape",
    });
    expect(args).toContain("landscape");
  });

  test("page range", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      pages: "1-3",
    });
    expect(args).toContain("page-ranges=1-3");
  });

  test("multiple copies", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      copies: 3,
    });
    expect(args).toContain("3");
  });

  test("letter paper size", () => {
    const args = buildLpArgs("/tmp/test.pdf", {
      ...defaultConfig,
      paperSize: "letter",
    });
    expect(args).toContain("media=letter");
  });
});

describe("pdf", () => {
  test("getPageCount returns 1 for sample PDF", async () => {
    const count = await getPageCount(samplePdf);
    expect(count).toBe(1);
  });
});

describe("email-to-print", () => {
  test("print sample PDF via email", async () => {
    const result = await print(samplePdf, defaultConfig, "sample.pdf");
    expect(result).toContain("Email sent to");
  }, 35000);
});

describe("cups integration", () => {
  test("print sample PDF via CUPS", async () => {
    if (!(await hasPrinter())) {
      console.log("Skipping: no printer configured in CUPS");
      return;
    }
    const { printViaCups } = await import("./printer");
    const result = await printViaCups(samplePdf, defaultConfig);
    expect(result).toContain("request id");
  });

  test("get printer status", async () => {
    const status = await getPrinterStatus();
    expect(typeof status).toBe("string");
    expect(status.length).toBeGreaterThan(0);
  });
});
