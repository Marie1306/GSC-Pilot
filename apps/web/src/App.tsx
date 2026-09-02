import type { ComponentType } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { canAccessBudget, canAccessOverviewViews, canAccessDeliveries, canAccessServiceCalls } from "@gsc-pilot/business-rules";
import { AuthProvider } from "./lib/auth/AuthProvider.js";
import { RequireRole } from "./lib/auth/RequireRole.js";
import { AppShell } from "./components/AppShell.js";
import { LoginPage } from "./features/auth/LoginPage.js";
import { AcceptInvitePage } from "./features/auth/AcceptInvitePage.js";
import { BudgetExportView } from "./features/budgets/BudgetExportView.js";
import { ProjectPostMortemExportView } from "./features/projects/ProjectPostMortemExportView.js";
import { DeliveryExportView } from "./features/fulfillment/DeliveryExportView.js";
import { ServiceCallExportView } from "./features/serviceCalls/ServiceCallExportView.js";
import { NAV_ITEMS } from "./lib/nav.js";
import { DashboardPage } from "./features/dashboard/DashboardPage.js";
import { ActionCenterPage } from "./features/actionCenter/ActionCenterPage.js";
import { ClientRequestsPage } from "./features/clientRequests/ClientRequestsPage.js";
import { BudgetsPage } from "./features/budgets/BudgetsPage.js";
import { ProjectsPage } from "./features/projects/ProjectsPage.js";
import { InvoicingPage } from "./features/invoicing/InvoicingPage.js";
import { PurchasesPage } from "./features/purchases/PurchasesPage.js";
import { TimePunchPage } from "./features/timePunch/TimePunchPage.js";
import { QrScanPage } from "./features/qrScan/QrScanPage.js";
import { ServiceCallsPage } from "./features/serviceCalls/ServiceCallsPage.js";
import { FulfillmentPage } from "./features/fulfillment/FulfillmentPage.js";
import { RollingsPage } from "./features/rollings/RollingsPage.js";
import { ContactsPage } from "./features/contacts/ContactsPage.js";
import { ReportsPage } from "./features/reports/ReportsPage.js";
import { SettingsPage } from "./features/settings/SettingsPage.js";
import { ChecklistPage } from "./features/checklists/ChecklistPage.js";
import { ErrorReportsPage } from "./features/errorReports/ErrorReportsPage.js";
import { initOfflineSync } from "./offline/sync.js";

initOfflineSync();

const PAGE_BY_KEY: Record<string, ComponentType> = {
  dashboard: DashboardPage,
  "action-center": ActionCenterPage,
  "client-requests": ClientRequestsPage,
  budgets: BudgetsPage,
  projects: ProjectsPage,
  invoicing: InvoicingPage,
  purchases: PurchasesPage,
  "time-punch": TimePunchPage,
  "qr-scan": QrScanPage,
  "service-calls": ServiceCallsPage,
  fulfillment: FulfillmentPage,
  rollings: RollingsPage,
  contacts: ContactsPage,
  reports: ReportsPage,
  settings: SettingsPage,
  checklist: ChecklistPage,
  "error-reports": ErrorReportsPage,
};

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/connexion" element={<LoginPage />} />
          <Route path="/accepter-invitation" element={<AcceptInvitePage />} />
          <Route
            path="/budgetaire/:id/export"
            element={
              <RequireRole allow={canAccessBudget}>
                <BudgetExportView />
              </RequireRole>
            }
          />
          <Route
            path="/projets/:id/post-mortem/export"
            element={
              <RequireRole allow={canAccessOverviewViews}>
                <ProjectPostMortemExportView />
              </RequireRole>
            }
          />
          <Route
            path="/livraisons/:id/export"
            element={
              <RequireRole allow={canAccessDeliveries}>
                <DeliveryExportView />
              </RequireRole>
            }
          />
          <Route
            path="/appels-service/:id/export"
            element={
              <RequireRole allow={canAccessServiceCalls}>
                <ServiceCallExportView />
              </RequireRole>
            }
          />
          <Route
            element={
              <RequireRole allow={() => true}>
                <AppShell />
              </RequireRole>
            }
          >
            {NAV_ITEMS.map((item) => {
              const Page = PAGE_BY_KEY[item.key];
              if (!Page) return null;
              const element = (
                <RequireRole allow={item.allow}>
                  <Page />
                </RequireRole>
              );
              return item.path === "/" ? (
                <Route key={item.key} index element={element} />
              ) : (
                <Route key={item.key} path={item.path.slice(1)} element={element} />
              );
            })}
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
