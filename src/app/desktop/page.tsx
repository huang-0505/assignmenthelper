import { GameProvider } from "@/components/provider";
import { Study } from "@/components/study";
import { DesktopFrame } from "@/components/desktop-frame";

export default function DesktopPage() {
  return (
    <DesktopFrame>
      <GameProvider>
        <Study desktop />
      </GameProvider>
    </DesktopFrame>
  );
}
