// Read catalogue pages explicitly: the API's default row cap must not silently
// hide stock, variants or collection members from the administrator.
export async function loadPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const data: T[] = [];
  for (let from = 0; ; from += 500) {
    const page = await fetchPage(from, from + 499);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data || []));
    if ((page.data?.length || 0) < 500) return { data, error: null };
  }
}
