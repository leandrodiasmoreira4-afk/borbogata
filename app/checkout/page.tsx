import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { StoreHeader } from "../components/store-header";
import { CheckoutClient } from "../components/checkout-client";

export default function CheckoutPage() {
  return <><StoreHeader/><main className="cart-page checkout-page">
    <Link href="/carrinho" className="back-link"><ChevronLeft size={18}/> Voltar ao carrinho</Link>
    <h1>Finalizar compra</h1><CheckoutClient/>
  </main></>;
}
