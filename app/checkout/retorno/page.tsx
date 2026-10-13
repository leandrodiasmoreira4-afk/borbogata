import Link from "next/link";

export const metadata = { title: "Retorno do pagamento | Borbogata", robots: { index: false, follow: false } };

export default function PaymentReturn() {
  return <main className="cart-page"><h1>Retorno do pagamento de teste</h1>
    <p>O retorno do Mercado Pago não confirma a aprovação. A loja verifica o pagamento diretamente com o provedor antes de confirmar o pedido e baixar o estoque.</p>
    <p>Se o pagamento estiver pendente, aguarde a atualização. Não faça outro pagamento para o mesmo pedido.</p>
    <Link href="/produtos">Voltar aos produtos</Link>
  </main>;
}
