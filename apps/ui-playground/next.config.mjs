import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ["@calcom/ui"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withMDX(config);
