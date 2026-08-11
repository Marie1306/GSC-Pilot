import { canCreatePurchaseShortlist } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ShortlistForm } from "./ShortlistForm.js";
import { PurchaseRequestList } from "./PurchaseRequestList.js";
import "./purchases.css";

export function PurchasesPage() {
  const { employee } = useAuth();
  if (!employee) return null;

  return (
    <div>
      {canCreatePurchaseShortlist(employee.persona) && <ShortlistForm />}
      <PurchaseRequestList />
    </div>
  );
}
