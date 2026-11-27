import type { NextConfig } from "next";

const config: NextConfig = {
  // prismarine-nbt is plain CommonJS; keep it out of the bundler.
  serverExternalPackages: ["prismarine-nbt"],
};

export default config;
