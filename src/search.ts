export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Free, no-API-key web search via DuckDuckGo's HTML endpoint.
 *
 * Network conditions vary, so this is written defensively: if the request fails
 * or returns nothing, we simply return an empty list and the research agent
 * degrades gracefully (it relies on the LLM's own knowledge instead).
 */
export async function webSearch(query: string, limit = 6): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    return parseDuckDuckGo(html, limit);
  } catch {
    return [];
  }
}

function parseDuckDuckGo(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Each result link looks like: <a ... class="result__a" href="...">Title</a>
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
  // Snippets look like: <a ... class="result__snippet" ...>snippet</a>
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gs;

  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(sm[1]));
  }

  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html)) !== null && results.length < limit) {
    results.push({
      title: stripTags(m[2]),
      url: decodeDuckUrl(m[1]),
      snippet: snippets[i] ?? '',
    });
    i++;
  }
  return results;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// DuckDuckGo wraps target URLs like //duckduckgo.com/l/?uddg=<encoded>&...
function decodeDuckUrl(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      /* fall through */
    }
  }
  return href.startsWith('//') ? 'https:' + href : href;
}
