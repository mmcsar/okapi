import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/p/"],
        disallow: ["/admin", "/api/", "/auth/", "/preview/"],
      },
    ],
  };
}
