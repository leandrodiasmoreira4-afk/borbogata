import type { DeliveryMethod } from "./quote";

export type CheckoutDetails = {
  name: string;
  email: string;
  phone: string;
  delivery: DeliveryMethod;
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  recipientName?: string;
  recipientDocument?: string;
};

export function isValidCPF(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const position of [9, 10]) {
    const sum = [...digits.slice(0, position)].reduce((total, digit, index) => total + Number(digit) * (position + 1 - index), 0);
    const check = (sum * 10) % 11;
    if (Number(digits[position]) !== (check === 10 ? 0 : check)) return false;
  }
  return true;
}

export function validateCheckoutDetails(details: CheckoutDetails): string | null {
  if (!details || typeof details !== "object" ||
      ![details.name, details.email, details.phone].every(value => typeof value === "string") ||
      !["pickup", "courier", "correios"].includes(details.delivery)) return "Dados de checkout inválidos.";
  const addressFields = [details.postalCode, details.street, details.number, details.complement, details.district, details.city, details.state, details.recipientName, details.recipientDocument];
  if (addressFields.some(value => value !== undefined && (typeof value !== "string" || value.length > 200))) return "Endereço inválido.";
  if (details.name.trim().length < 3 || details.name.trim().length > 120) return "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim()) || details.email.length > 254) return "Informe um e-mail válido.";
  const phone = details.phone.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 11) return "Informe um celular com DDD.";
  if (details.delivery === "pickup") return null;
  if (!/^\d{5}-?\d{3}$/.test(details.postalCode?.trim() || "")) return "Informe um CEP válido.";
  if (!details.street?.trim() || !details.number?.trim() || !details.district?.trim() || !details.city?.trim()) return "Preencha o endereço de entrega completo.";
  if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(details.state?.trim().toUpperCase() || "")) return "Informe uma UF válida.";
  if (details.delivery === "courier" && (details.city.trim().toLocaleLowerCase("pt-BR") !== "salvador" || details.state?.trim().toUpperCase() !== "BA")) {
    return "Motoboy disponível apenas para endereços em Salvador, BA.";
  }
  if (details.delivery === "correios") {
    if (details.recipientName && (details.recipientName.trim().length < 3 || details.recipientName.length > 120)) return "Informe o nome completo do destinatário.";
    if (!isValidCPF(details.recipientDocument || "")) return "Informe um CPF válido para a postagem pelos Correios.";
  }
  return null;
}
