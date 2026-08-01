import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

/**
 * One prompt in, the model's text out.
 *
 * The key is read per call rather than at import time, so a script that never
 * reaches an API call — `--help`, a dry run, an empty queue — does not fail
 * on a missing key.
 */
export async function ask(prompt: string, maxTokens = 1024): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it before running this stage."
    );
  }

  const message = await new Anthropic({ apiKey }).messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}
