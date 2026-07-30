function extractJobs(html) {
  const jobs = [];
  const seen = new Set();

  const jsonLdRegex =
    /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;

  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());

      if (
        data["@type"] !== "ItemList" ||
        !Array.isArray(data.itemListElement)
      ) {
        continue;
      }

      for (const item of data.itemListElement) {

        if (!item.name || !item.url) continue;

        if (seen.has(item.url)) continue;
        seen.add(item.url);

        jobs.push({
          title: item.name.trim(),
          company: "",
          url: item.url,
          source: "kariera",
          dateRaw: "",
          date: null,
          tags: ["Πάτρα"]
        });
      }

    } catch (e) {
      console.log("[kariera] invalid JSON-LD block");
    }
  }

  return jobs;
}
