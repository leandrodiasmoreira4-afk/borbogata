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
};

export function validateCheckoutDetails(details: CheckoutDetails): string | null {
  if (details.name.trim().length < 3 || details.name.trim().length > 120) return "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim()) || details.email.length > 254) return "Informe um e-mail válido.";
  const phone = details.phone.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 11) return "Informe um celular com DDD.";
  if (details.delivery === "pickup") return null;
  if (details.postalCode?.replace(/\D/g, "").length !== 8) return "Informe um CEP válido.";
  if (!details.street?.trim() || !details.number?.trim() || !details.district?.trim() || !details.city?.trim()) return "Preencha o endereço de entrega completo.";
  if (!/^[a-zA-Z]{2}$/.test(details.state?.trim() || "")) return "Informe a UF com duas letras.";
  if (details.delivery === "courier" && (details.city.trim().toLocaleLowerCase("pt-BR") !== "salvador" || details.state?.trim().toUpperCase() !== "BA")) {
    return "Motoboy disponível apenas para endereços em Salvador, BA.";
  }
  return null;
}
