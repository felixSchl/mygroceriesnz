import type { Retailer } from "@repo/db";
import { ImageProps } from "react-native";
import NW from "../assets/retailers/nw.svg";
import PNS from "../assets/retailers/pns.svg";
import WW from "../assets/retailers/ww.svg";
import { memo } from "react";

const Retailers: Record<
  Retailer,
  {
    name: string;
    icon: React.FC<any>;
  }
> = {
  nw: { name: "New World", icon: NW },
  ww: { name: "Woolworths", icon: WW },
  pns: { name: "PAK'nSAVE", icon: PNS },
};

interface RetailerIconProps extends Omit<ImageProps, "source" | "alt"> {
  retailer: Retailer;
}

function _RetailerIcon({ retailer, ...props }: RetailerIconProps) {
  const SvgComponent = Retailers[retailer].icon;
  return <SvgComponent width={24} height={24} {...props} />;
}

export const RetailerIcon = memo(_RetailerIcon);
