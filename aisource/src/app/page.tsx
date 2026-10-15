import { LandingChannels } from "@/components/LandingChannels";
import { LandingFlow } from "@/components/LandingFlow";
import { LandingHero } from "@/components/LandingHero";
import { SiteFooter } from "@/components/SiteFooter";

export default function HomePage() {
  return (
    <>
      <LandingHero />
      <LandingChannels />
      <LandingFlow />
      <SiteFooter />
    </>
  );
}
