import { notFound } from "next/navigation";
import { Applications } from "@/components/applications";
import { GameProvider } from "@/components/provider";
import { Shell } from "@/components/shell";
import { Study } from "@/components/study";
import { Today } from "@/components/today";
import {
  History,
  Projects,
  Referee,
  SettingsView,
  Stats,
} from "@/components/views";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view } = await params;
  const key = view?.join("/") || "";
  const views = {
    "": Today,
    applications: Applications,
    history: History,
    stats: Stats,
    projects: Projects,
    referee: Referee,
    settings: SettingsView,
    study: Study,
  };
  if (!Object.hasOwn(views, key)) notFound();
  const View = views[key as keyof typeof views];
  return (
    <GameProvider>
      <Shell>
        <View />
      </Shell>
    </GameProvider>
  );
}
