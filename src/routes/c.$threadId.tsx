import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/nova/ChatShell";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Sohbet — MelihBot Nova Yapay Zeka" },
      {
        name: "description",
        content: "MelihBot Nova ile sohbetine kaldığın yerden devam et; geçmişin bu cihazda güvenle saklanır.",
      },
      { property: "og:title", content: "Sohbet — MelihBot Nova Yapay Zeka" },
      {
        property: "og:description",
        content: "MelihBot Nova ile sohbetine kaldığın yerden devam et.",
      },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatShell threadId={threadId} />;
}
