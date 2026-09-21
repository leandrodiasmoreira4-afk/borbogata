import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CartClient } from "../components/cart-client";
import { StoreHeader } from "../components/store-header";
export default function CartPage(){return <><StoreHeader/><main className="cart-page"><Link href="/produtos" className="back-link"><ChevronLeft size={18}/> Continuar comprando</Link><h1>Meu carrinho</h1><CartClient/></main></>}
