import React from "react";
import { AdsPage } from "./pages/AdsPage.jsx";
import { SellerProfilePage } from "./pages/SellerProfilePage.jsx";

function getSellerOidFromPath() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/seller\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function App() {
  const sellerOid = getSellerOidFromPath();
  if (sellerOid) {
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <SellerProfilePage accountOid={sellerOid} onBack={() => (window.location.href = "/")} />
      </main>
    );
  }
  return <AdsPage />;
}
