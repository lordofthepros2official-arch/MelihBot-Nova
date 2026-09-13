import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/nova/ChatShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MelihBot Nova — Yapay Zeka Asistanı" },
      {
        name: "description",
        content:
          "MelihBot Nova: sesli konuşma, canlı mod ve gizlilik odaklı yapay zeka asistanı. Sorularını yaz, konuş veya görsel promptlarını keşfet.",
      },
      { property: "og:title", content: "MelihBot Nova — Yapay Zeka Asistanı" },
      {
        property: "og:description",
        content: "Gizlilik odaklı, sesli ve canlı sohbet destekli yapay zeka asistanı.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <ChatShell />;
}
