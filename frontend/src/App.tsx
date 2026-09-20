import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageSkeleton, Spinner } from "./components/ui";
import { HOME_FOR, useAuth } from "./lib/auth";
import type { Role } from "./lib/types";

const page = (loader: () => Promise<{ default: React.ComponentType }>) => lazy(loader);

// Public
const Landing = page(() => import("./pages/public/Landing"));
const Login = page(() => import("./pages/public/Login"));
const Register = page(() => import("./pages/public/Register"));
const ForgotPassword = page(() => import("./pages/public/ForgotPassword"));
const ResetPassword = page(() => import("./pages/public/ResetPassword"));
const GuestAsk = page(() => import("./pages/public/GuestAsk"));
// Household
const Home = page(() => import("./pages/customer/Home"));
const AskAI = page(() => import("./pages/customer/AskAI"));
const Guide = page(() => import("./pages/customer/Guide"));
const CategoryGuide = page(() => import("./pages/customer/CategoryGuide"));
const Learn = page(() => import("./pages/customer/Learn"));
const LessonPage = page(() => import("./pages/customer/LessonPage"));
const Pickups = page(() => import("./pages/customer/Pickups"));
const SchedulePickup = page(() => import("./pages/customer/SchedulePickup"));
const PickupDetail = page(() => import("./pages/customer/PickupDetail"));
const Rewards = page(() => import("./pages/customer/Rewards"));
const Impact = page(() => import("./pages/customer/Impact"));
const HouseholdPage = page(() => import("./pages/customer/HouseholdPage"));
const DropOffs = page(() => import("./pages/customer/DropOffs"));
const Me = page(() => import("./pages/customer/Me"));
const Profile = page(() => import("./pages/customer/Profile"));
const Notifications = page(() => import("./pages/shared/Notifications"));
// Collection partner
const PartnerHome = page(() => import("./pages/partner/PartnerHome"));
const PartnerPickups = page(() => import("./pages/partner/PartnerPickups"));
const PartnerPickup = page(() => import("./pages/partner/PartnerPickup"));
const PartnerEarnings = page(() => import("./pages/partner/PartnerEarnings"));
const PartnerProfile = page(() => import("./pages/partner/PartnerProfile"));
// Recycler
const RecyclerHome = page(() => import("./pages/recycler/RecyclerHome"));
const RecyclerOrders = page(() => import("./pages/recycler/RecyclerOrders"));
const RecyclerInvoices = page(() => import("./pages/recycler/RecyclerInvoices"));
const Invoice = page(() => import("./pages/recycler/Invoice"));
const RecyclerProfile = page(() => import("./pages/recycler/RecyclerProfile"));
// Admin
const AdminOverview = page(() => import("./pages/admin/AdminOverview"));
const AdminPickups = page(() => import("./pages/admin/AdminPickups"));
const AdminUsers = page(() => import("./pages/admin/AdminUsers"));
const AdminAI = page(() => import("./pages/admin/AdminAI"));
const AdminKnowledge = page(() => import("./pages/admin/AdminKnowledge"));
const AdminContent = page(() => import("./pages/admin/AdminContent"));
const AdminOrders = page(() => import("./pages/admin/AdminOrders"));
const AdminPayouts = page(() => import("./pages/admin/AdminPayouts"));
const AdminAudit = page(() => import("./pages/admin/AdminAudit"));

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="size-8" />
    </div>
  );
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== role) return <Navigate to={HOME_FOR[user.role]} replace />;
  return <>{children}</>;
}

function Shell({ role }: { role: Role }) {
  return (
    <RequireRole role={role}>
      <AppShell role={role} />
    </RequireRole>
  );
}

function S({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/ask" element={<GuestAsk />} />

        <Route path="/app" element={<Shell role="customer" />}>
          <Route index element={<S><Home /></S>} />
          <Route path="ask" element={<S><AskAI /></S>} />
          <Route path="guide" element={<S><Guide /></S>} />
          <Route path="guide/:slug" element={<S><CategoryGuide /></S>} />
          <Route path="learn" element={<S><Learn /></S>} />
          <Route path="learn/:slug" element={<S><LessonPage /></S>} />
          <Route path="pickups" element={<S><Pickups /></S>} />
          <Route path="pickups/new" element={<S><SchedulePickup /></S>} />
          <Route path="pickups/:code" element={<S><PickupDetail /></S>} />
          <Route path="rewards" element={<S><Rewards /></S>} />
          <Route path="impact" element={<S><Impact /></S>} />
          <Route path="household" element={<S><HouseholdPage /></S>} />
          <Route path="dropoffs" element={<S><DropOffs /></S>} />
          <Route path="me" element={<S><Me /></S>} />
          <Route path="profile" element={<S><Profile /></S>} />
          <Route path="notifications" element={<S><Notifications /></S>} />
        </Route>

        <Route path="/partner" element={<Shell role="partner" />}>
          <Route index element={<S><PartnerHome /></S>} />
          <Route path="pickups" element={<S><PartnerPickups /></S>} />
          <Route path="pickups/:code" element={<S><PartnerPickup /></S>} />
          <Route path="earnings" element={<S><PartnerEarnings /></S>} />
          <Route path="profile" element={<S><PartnerProfile /></S>} />
          <Route path="notifications" element={<S><Notifications /></S>} />
        </Route>

        <Route path="/recycler" element={<Shell role="recycler" />}>
          <Route index element={<S><RecyclerHome /></S>} />
          <Route path="orders" element={<S><RecyclerOrders /></S>} />
          <Route path="invoices" element={<S><RecyclerInvoices /></S>} />
          <Route path="invoices/:number" element={<S><Invoice /></S>} />
          <Route path="profile" element={<S><RecyclerProfile /></S>} />
          <Route path="notifications" element={<S><Notifications /></S>} />
        </Route>

        <Route path="/admin" element={<Shell role="admin" />}>
          <Route index element={<S><AdminOverview /></S>} />
          <Route path="pickups" element={<S><AdminPickups /></S>} />
          <Route path="users" element={<S><AdminUsers /></S>} />
          <Route path="ai" element={<S><AdminAI /></S>} />
          <Route path="knowledge" element={<S><AdminKnowledge /></S>} />
          <Route path="content" element={<S><AdminContent /></S>} />
          <Route path="orders" element={<S><AdminOrders /></S>} />
          <Route path="payouts" element={<S><AdminPayouts /></S>} />
          <Route path="audit" element={<S><AdminAudit /></S>} />
          <Route path="invoices/:number" element={<S><Invoice /></S>} />
          <Route path="notifications" element={<S><Notifications /></S>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
