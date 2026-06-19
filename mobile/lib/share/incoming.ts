import { extractUrl } from '@/lib/utils/source';

export type IncomingShare = {
  url: string;
  title: string;
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function parseIncomingShareParams(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): IncomingShare | null {
  const read = (key: string): string => {
    if (params instanceof URLSearchParams) {
      return params.get(key) ?? '';
    }
    return first(params[key]);
  };

  const urlParam = read('url');
  const textParam = read('text');
  const titleParam = read('title');

  const url = urlParam || extractUrl(textParam) || extractUrl(titleParam);
  if (!url) return null;

  let title = titleParam.trim();
  if (!title && textParam) {
    title = textParam.replace(url, '').trim();
  }

  return { url, title };
}
