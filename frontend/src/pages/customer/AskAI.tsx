import { ChatPanel } from "@/components/chat/ChatPanel";
import { useDocumentTitle } from "@/lib/hooks";

export default function AskAI() {
  useDocumentTitle("Swacchify AI");
  return (
    <div className="mx-auto max-w-3xl">
      <ChatPanel />
    </div>
  );
}
