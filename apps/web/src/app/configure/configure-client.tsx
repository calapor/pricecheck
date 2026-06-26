"use client";

import { useState } from "react";
import { ProductsPanel } from "./products-panel";
import { ShopsPanel } from "./shops-panel";
import { SaveToast } from "./save-toast";

interface Product {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
}

interface Retailer {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

interface Props {
  initialProducts: Product[];
  initialRetailers: Retailer[];
}

export function ConfigureClient({ initialProducts, initialRetailers }: Props) {
  const [toast, setToast] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <ProductsPanel initial={initialProducts} onSaved={() => setToast(true)} />
        <ShopsPanel initial={initialRetailers} onSaved={() => setToast(true)} />
      </div>
      <SaveToast show={toast} onDone={() => setToast(false)} />
    </>
  );
}
