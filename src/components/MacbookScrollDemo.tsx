import React from "react";
import { MacbookScroll } from "@/components/ui/macbook-scroll";
import heroImageUrl from "../../assets/hero-image.png?url";

export default function MacbookScrollDemo() {
  return (
    <div className="w-full bg-transparent">
      <MacbookScroll
        src={heroImageUrl}
        showGradient={false}
      />
    </div>
  );
}
