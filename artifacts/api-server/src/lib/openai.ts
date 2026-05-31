import OpenAI from "openai";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.startsWith("sk-placeholder")) {
    return null;
  }
  return new OpenAI({ apiKey: key });
}

export const openai = getOpenAI();
