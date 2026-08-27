import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY || "";
const baseURL = process.env.OPENAI_BASE_URL || undefined;

export const MODEL =
  process.env.OPENAI_MODEL || "gpt-4o-mini";

export const hasOpenAI = Boolean(apiKey);

const isGpt5 = /gpt-5/i.test(MODEL);
const supportsTemperature = !isGpt5;

const reasoningEffort =
  process.env.OPENAI_REASONING_EFFORT || "low";

const gpt5Extra = isGpt5
  ? { reasoning_effort: reasoningEffort }
  : {};

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: baseURL
        ? { "api-key": apiKey }
        : undefined,
    })
  : null;

// ------------------------------------------------------------
// Rate-limit cooldown
// ------------------------------------------------------------

let llmRateLimitedUntil = 0;

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5000;

// ------------------------------------------------------------
// Error helpers
// ------------------------------------------------------------

type CompletionError = {
  status?: number;
  code?: string;
  message?: string;
};

function getErrorInfo(err: unknown): CompletionError {
  if (!err || typeof err !== "object") {
    return {};
  }

  const value = err as {
    status?: number;
    code?: string;
    message?: string;
    error?: {
      code?: string;
      message?: string;
    };
  };

  return {
    status: value.status,
    code: value.code ?? value.error?.code,
    message: value.message ?? value.error?.message,
  };
}

function isLLMRateLimited(): boolean {
  return Date.now() < llmRateLimitedUntil;
}

function activateRateLimitCooldown(ms: number): void {
  llmRateLimitedUntil = Math.max(
    llmRateLimitedUntil,
    Date.now() + ms,
  );
}

function getRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }

  const value = err as {
    headers?: {
      get?: (name: string) => string | null;
    };
  };

  const retryAfter =
    value.headers?.get?.("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  return undefined;
}

// ------------------------------------------------------------
// JSON parser
// ------------------------------------------------------------

function parseJson<T>(raw: string): T {
  let cleaned = raw.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as T;
}

// ------------------------------------------------------------
// JSON completion
// ------------------------------------------------------------

export async function jsonCompletion<T>(opts: {
  system: string;
  user: string;
  fallback: T;
  maxTokens?: number;
  agent?: string;
  temperature?: number;
}): Promise<T> {
  const agent = opts.agent ?? "unknown";
  const maxTokens = opts.maxTokens ?? 1000;

  if (isLLMRateLimited()) {
    console.warn(
      `[LLM] agent=${agent} FALLBACK reason=429_COOLDOWN`,
    );
    return opts.fallback;
  }

  if (!client) {
    console.warn(
      `[LLM] agent=${agent} FALLBACK reason=no_client`,
    );
    return opts.fallback;
  }

  const inputChars =
    opts.system.length + opts.user.length;

  console.log(
    `[LLM] agent=${agent} inputChars=${inputChars} maxTokens=${maxTokens}`,
  );

  try {
    const res =
      await client.chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,

        ...(supportsTemperature
          ? {
              temperature:
                opts.temperature ?? 0.2,
            }
          : {}),

        ...gpt5Extra,

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content: opts.system,
          },
          {
            role: "user",
            content: opts.user,
          },
        ],
      } as Parameters<
        typeof client.chat.completions.create
      >[0]);

    const raw = (
      res as {
        choices: {
          message?: {
            content?: string;
          };
        }[];
      }
    ).choices[0]?.message?.content;

    if (!raw?.trim()) {
      console.warn(
        `[LLM] agent=${agent} FALLBACK reason=empty_response`,
      );
      return opts.fallback;
    }

    try {
      const parsed = parseJson<T>(raw);

      console.log(
        `[LLM] agent=${agent} SUCCESS`,
      );

      return parsed;
    } catch (parseError) {
      console.error(
        `[LLM] agent=${agent} FALLBACK reason=invalid_json`,
        parseError,
      );

      console.error(
        `[LLM] agent=${agent} rawPreview=${raw.slice(0, 300)}`,
      );

      return opts.fallback;
    }
  } catch (err) {
    const info = getErrorInfo(err);

    if (
      info.status === 413 ||
      info.code === "request_too_large"
    ) {
      console.error(
        `[LLM] agent=${agent} FALLBACK reason=413_REQUEST_TOO_LARGE`,
      );
      return opts.fallback;
    }

    if (
      info.status === 429 ||
      info.code === "rate_limit_exceeded"
    ) {
      const retryAfterMs =
        getRetryAfterMs(err) ??
        DEFAULT_RATE_LIMIT_COOLDOWN_MS;

      const cooldownMs = Math.min(
        retryAfterMs,
        10000,
      );

      activateRateLimitCooldown(cooldownMs);

      console.warn(
        `[LLM] agent=${agent} 429_RATE_LIMIT, waiting ${cooldownMs}ms before retry...`,
      );

      // Wait out the cooldown and retry once
      await new Promise((resolve) => setTimeout(resolve, cooldownMs));

      try {
        const retryRes = await client.chat.completions.create({
          model: MODEL,
          max_tokens: maxTokens,
          ...(supportsTemperature ? { temperature: opts.temperature ?? 0.2 } : {}),
          ...gpt5Extra,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        } as Parameters<typeof client.chat.completions.create>[0]);

        const raw = (retryRes as any).choices?.[0]?.message?.content;
        if (raw?.trim()) {
          try {
            const parsed = parseJson<T>(raw);
            console.log(`[LLM] agent=${agent} SUCCESS (on retry)`);
            return parsed;
          } catch (parseError) {
            console.error(`[LLM] agent=${agent} FALLBACK reason=invalid_json_on_retry`, parseError);
          }
        }
      } catch (retryErr) {
        console.error(`[LLM] agent=${agent} retry failed:`, retryErr);
      }

      return opts.fallback;
    }

    console.error(
      `[LLM] agent=${agent} FALLBACK reason=provider_error`,
      err,
    );

    return opts.fallback;
  }
}

// ------------------------------------------------------------
// Plain-text completion
// ------------------------------------------------------------

export async function textCompletion(opts: {
  system: string;
  user: string;
  fallback: string;
  maxTokens?: number;
  agent?: string;
  temperature?: number;
}): Promise<string> {
  const agent = opts.agent ?? "unknown";
  const maxTokens = opts.maxTokens ?? 500;

  if (isLLMRateLimited()) {
    console.warn(
      `[LLM] agent=${agent} FALLBACK reason=429_COOLDOWN`,
    );
    return opts.fallback;
  }

  if (!client) {
    console.warn(
      `[LLM] agent=${agent} FALLBACK reason=no_client`,
    );
    return opts.fallback;
  }

  const inputChars =
    opts.system.length + opts.user.length;

  console.log(
    `[LLM] agent=${agent} inputChars=${inputChars} maxTokens=${maxTokens}`,
  );

  try {
    const res =
      await client.chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,

        ...(supportsTemperature
          ? {
              temperature:
                opts.temperature ?? 0.3,
            }
          : {}),

        ...gpt5Extra,

        messages: [
          {
            role: "system",
            content: opts.system,
          },
          {
            role: "user",
            content: opts.user,
          },
        ],
      } as Parameters<
        typeof client.chat.completions.create
      >[0]);

    const content = (
      res as {
        choices: {
          message?: {
            content?: string;
          };
        }[];
      }
    ).choices[0]?.message?.content?.trim();

    if (!content) {
      console.warn(
        `[LLM] agent=${agent} FALLBACK reason=empty_response`,
      );

      return opts.fallback;
    }

    console.log(
      `[LLM] agent=${agent} SUCCESS`,
    );

    return content;
  } catch (err) {
    const info = getErrorInfo(err);

    if (
      info.status === 413 ||
      info.code === "request_too_large"
    ) {
      console.error(
        `[LLM] agent=${agent} FALLBACK reason=413_REQUEST_TOO_LARGE`,
      );

      return opts.fallback;
    }

    if (
      info.status === 429 ||
      info.code === "rate_limit_exceeded"
    ) {
      const retryAfterMs =
        getRetryAfterMs(err) ??
        DEFAULT_RATE_LIMIT_COOLDOWN_MS;

      const cooldownMs = Math.min(
        retryAfterMs,
        10000,
      );

      activateRateLimitCooldown(cooldownMs);

      console.warn(
        `[LLM] agent=${agent} 429_RATE_LIMIT, waiting ${cooldownMs}ms before text retry...`,
      );

      await new Promise((resolve) => setTimeout(resolve, cooldownMs));

      try {
        const retryRes = await client.chat.completions.create({
          model: MODEL,
          max_tokens: maxTokens,
          ...(supportsTemperature ? { temperature: opts.temperature ?? 0.3 } : {}),
          ...gpt5Extra,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        } as Parameters<typeof client.chat.completions.create>[0]);

        const content = (retryRes as any).choices?.[0]?.message?.content?.trim();
        if (content) {
          console.log(`[LLM] agent=${agent} SUCCESS (on retry)`);
          return content;
        }
      } catch (retryErr) {
        console.error(`[LLM] agent=${agent} text retry failed:`, retryErr);
      }

      return opts.fallback;
    }

    console.error(
      `[LLM] agent=${agent} FALLBACK reason=provider_error`,
      err,
    );

    return opts.fallback;
  }
}