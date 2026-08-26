/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // These workspace packages export raw TypeScript (see their package.json
  // "exports" fields), not pre-compiled JS - Next.js doesn't transpile
  // anything under node_modules by default, even symlinked local workspace
  // packages, so without this every import from them fails to build.
  transpilePackages: ['@workspace/auth', '@workspace/db', '@workspace/flow-compiler'],
};

module.exports = nextConfig;
