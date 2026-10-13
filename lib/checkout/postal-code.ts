export async function lookupPostalCode(value: string, fetcher: typeof fetch = fetch) {
  if (!/^\d{5}-?\d{3}$/.test(value)) throw new Error("CEP inválido.");
  const code = value.replace("-", "");
  const response = await fetcher(`https://viacep.com.br/ws/${code}/json/`, { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error("Consulta de CEP indisponível.");
  const data = await response.json() as Record<string, unknown>;
  if (!data || data.erro === true || data.erro === "true") throw new Error("CEP não encontrado.");
  if (typeof data.cep !== "string" || data.cep.replace("-", "") !== code || typeof data.localidade !== "string" || !data.localidade ||
      typeof data.uf !== "string" || !/^[A-Z]{2}$/.test(data.uf)) throw new Error("Resposta de CEP inválida.");
  return { postalCode: code, city: data.localidade, state: data.uf };
}
