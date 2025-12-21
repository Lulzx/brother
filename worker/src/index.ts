import { Hono } from "hono";

type Bindings = {
  PRINT_JOBS: KVNamespace;
  PDF_BUCKET: R2Bucket;
  BOT_TOKEN: string;
  ALLOWED_USER_ID: string;
  WEBHOOK_SECRET: string;
};

type PrintJob = {
  id: string;
  url: string;
  copies: number;
  fileName: string;
  createdAt: number;
};

const app = new Hono<{ Bindings: Bindings }>();

// Telegram webhook handler
app.post("/webhook", async (c) => {
  const body = await c.req.json();
  const message = body.message;

  if (!message) return c.json({ ok: true });

  const userId = message.from?.id?.toString();
  if (userId !== c.env.ALLOWED_USER_ID) {
    await sendMessage(c.env.BOT_TOKEN, message.chat.id, "⛔ Unauthorized");
    return c.json({ ok: true });
  }

  // Handle /start command
  if (message.text === "/start") {
    await sendMessage(
      c.env.BOT_TOKEN,
      message.chat.id,
      "🖨️ Send me a PDF to print!\n\nUse /status to check printer bridge connection."
    );
    return c.json({ ok: true });
  }

  // Handle document
  const doc = message.document;
  if (doc && doc.mime_type === "application/pdf") {
    await sendMessage(c.env.BOT_TOKEN, message.chat.id, "📥 Processing...");

    // Download file from Telegram
    const fileInfo = await fetch(
      `https://api.telegram.org/bot${c.env.BOT_TOKEN}/getFile?file_id=${doc.file_id}`
    ).then((r) => r.json()) as { result: { file_path: string } };

    const fileUrl = `https://api.telegram.org/file/bot${c.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileData = await fetch(fileUrl).then((r) => r.arrayBuffer());

    // Store in R2
    const jobId = crypto.randomUUID();
    await c.env.PDF_BUCKET.put(jobId, fileData, {
      customMetadata: { fileName: doc.file_name || "document.pdf" },
    });

    // Create job in KV
    const job: PrintJob = {
      id: jobId,
      url: `/api/pdf/${jobId}`,
      copies: 1,
      fileName: doc.file_name || "document.pdf",
      createdAt: Date.now(),
    };
    await c.env.PRINT_JOBS.put(jobId, JSON.stringify(job));
    await c.env.PRINT_JOBS.put("pending:" + jobId, jobId);

    await sendMessage(
      c.env.BOT_TOKEN,
      message.chat.id,
      `✅ Queued: ${doc.file_name}\n\nJob ID: ${jobId.slice(0, 8)}...\nWaiting for printer bridge...`
    );
  }

  return c.json({ ok: true });
});

// ESP32 API: Get next pending job
app.get("/api/job", async (c) => {
  const keys = await c.env.PRINT_JOBS.list({ prefix: "pending:" });

  if (keys.keys.length === 0) {
    return c.json({ job: null }, 204);
  }

  const jobId = await c.env.PRINT_JOBS.get(keys.keys[0].name);
  if (!jobId) return c.json({ job: null }, 204);

  const jobData = await c.env.PRINT_JOBS.get(jobId);
  if (!jobData) return c.json({ job: null }, 204);

  const job = JSON.parse(jobData) as PrintJob;

  // Return full URL for PDF
  const workerUrl = new URL(c.req.url).origin;
  return c.json({
    id: job.id,
    url: `${workerUrl}/api/pdf/${job.id}`,
    copies: job.copies,
  });
});

// ESP32 API: Get PDF file
app.get("/api/pdf/:id", async (c) => {
  const id = c.req.param("id");
  const obj = await c.env.PDF_BUCKET.get(id);

  if (!obj) return c.notFound();

  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": obj.size.toString(),
    },
  });
});

// ESP32 API: Mark job complete
app.delete("/api/job/:id", async (c) => {
  const id = c.req.param("id");

  await c.env.PRINT_JOBS.delete("pending:" + id);
  await c.env.PRINT_JOBS.delete(id);
  await c.env.PDF_BUCKET.delete(id);

  return c.json({ ok: true });
});

// Health check for ESP32
app.get("/api/health", (c) => {
  return c.json({ status: "ok", time: Date.now() });
});

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export default app;
