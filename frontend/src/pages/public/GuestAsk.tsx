import { Navigate } from "react-router";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PublicHeader } from "@/components/PublicLayout";
import { useAuth } from "@/lib/auth";
import { useDocumentTitle } from "@/lib/hooks";

/** Swacchify AI without an account — the landing page's primary call to action. */
export default function GuestAsk() {
  const { user } = useAuth();
  useDocumentTitle("Swacchify AI");
  if (user?.role === "customer") return <Navigate to={`/app/ask${location.search}`} replace />;
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-8 sm:px-6">
        <ChatPanel guest />
      </main>
    </div>
  );
}
