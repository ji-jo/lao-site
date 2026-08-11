import { MacbookScroll } from "@/components/ui/macbook-scroll";
import HeroMiniDemo from "@/components/HeroMiniDemo";

export default function MacbookScrollDemo() {
  return (
    <div className="w-full bg-transparent">
      <MacbookScroll
        screen={<HeroMiniDemo />}
        showGradient={false}
      />
    </div>
  );
}
