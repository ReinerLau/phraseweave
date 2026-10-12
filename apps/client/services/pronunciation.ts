let dictionary: Promise<Record<string, string[]>> | undefined;

/** Import a separate build chunk once; no dictionary API or local service is needed. */
export function preloadPronunciations() {
  dictionary ??= import("~/assets/pronunciation/english-us.json?raw")
    .then((module) => JSON.parse(module.default) as Record<string, string[]>)
    .catch((error) => {
      dictionary = undefined; // Allow a later attempt if a resource load failed.
      throw error;
    });
  return dictionary;
}

export async function lookupPronunciation(word: string): Promise<string[] | undefined> {
  const key = word.trim().normalize("NFC").replace(/[‘’]/g, "'").toLowerCase();
  if (!/^[a-z]+(?:'[a-z]+)*$/.test(key)) return undefined;
  const entries = await preloadPronunciations();
  return Object.hasOwn(entries, key) ? entries[key] : undefined;
}
